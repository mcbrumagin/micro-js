"""
Micro-JS Python Client Library
A lightweight microservices framework client for Python
"""

import os
import json
import asyncio
import hashlib
import secrets
from typing import Callable, Dict, Any, Optional, Union
from http.server import HTTPServer, BaseHTTPRequestHandler
import requests
from threading import Thread
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger('microjs')


class MicroHeaders:
    """HTTP header constants for micro-js protocol"""
    
    # Commands
    COMMAND = 'micro-command'
    
    # Service operations
    SERVICE_NAME = 'micro-service-name'
    SERVICE_LOCATION = 'micro-service-location'
    USE_AUTH_SERVICE = 'micro-use-auth-service'
    SERVICE_HOME = 'micro-service-home'
    
    # Authentication
    AUTH_TOKEN = 'micro-auth-token'
    REGISTRY_TOKEN = 'micro-registry-token'
    
    # Route operations
    ROUTE_DATATYPE = 'micro-route-datatype'
    ROUTE_TYPE = 'micro-route-type'
    ROUTE_PATH = 'micro-route-path'
    
    # Pub/sub operations
    PUBSUB_CHANNEL = 'micro-pubsub-channel'


class MicroCommands:
    """Command types for micro-js protocol"""
    
    HEALTH = 'health'
    SERVICE_SETUP = 'service-setup'
    SERVICE_REGISTER = 'service-register'
    SERVICE_UNREGISTER = 'service-unregister'
    SERVICE_LOOKUP = 'service-lookup'
    SERVICE_CALL = 'service-call'
    ROUTE_REGISTER = 'route-register'
    PUBSUB_PUBLISH = 'pubsub-publish'
    PUBSUB_SUBSCRIBE = 'pubsub-subscribe'
    PUBSUB_UNSUBSCRIBE = 'pubsub-unsubscribe'
    CACHE_UPDATE = 'cache-update'


class MicroJSError(Exception):
    """Base exception for Micro-JS errors"""
    
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"{status_code}: {message}")


class ServiceContext:
    """Context object passed to service functions"""
    
    def __init__(self, cache: Dict[str, Any], service_name: str, service_location: str, registry_host: str):
        self.cache = cache
        self.service_name = service_name
        self.service_location = service_location
        self.registry_host = registry_host
        self._subscriptions = {}
        
    async def call(self, service_name: str, payload: Any = None) -> Any:
        """Call another service by name"""
        return await call_service(service_name, payload)
    
    async def publish(self, channel: str, message: Any) -> Dict[str, Any]:
        """Publish a message to a channel"""
        return await publish_message(channel, message)
    
    async def subscribe(self, channel: str, handler: Callable) -> str:
        """Subscribe to a channel"""
        sub_id = f"sub_{channel}_{len(self._subscriptions)}_{asyncio.get_event_loop().time()}"
        
        if channel not in self._subscriptions:
            self._subscriptions[channel] = {}
            # Register with registry
            registry_token = os.environ.get('MICRO_REGISTRY_TOKEN')
            headers = {
                MicroHeaders.COMMAND: MicroCommands.PUBSUB_SUBSCRIBE,
                MicroHeaders.PUBSUB_CHANNEL: channel,
                MicroHeaders.SERVICE_LOCATION: self.service_location
            }
            if registry_token:
                headers[MicroHeaders.REGISTRY_TOKEN] = registry_token
            
            response = requests.post(self.registry_host, headers=headers, json={})
            if response.status_code >= 400:
                raise MicroJSError(response.status_code, response.text)
        
        self._subscriptions[channel][sub_id] = handler
        logger.debug(f"subscribe [{self.service_name}] - channel: {channel}, id: {sub_id}")
        return sub_id
    
    async def unsubscribe(self, channel: str, sub_id: str) -> bool:
        """Unsubscribe from a channel"""
        if channel not in self._subscriptions or sub_id not in self._subscriptions[channel]:
            return False
        
        del self._subscriptions[channel][sub_id]
        
        # If no more handlers for this channel, unregister from registry
        if not self._subscriptions[channel]:
            del self._subscriptions[channel]
            registry_token = os.environ.get('MICRO_REGISTRY_TOKEN')
            headers = {
                MicroHeaders.COMMAND: MicroCommands.PUBSUB_UNSUBSCRIBE,
                MicroHeaders.PUBSUB_CHANNEL: channel,
                MicroHeaders.SERVICE_LOCATION: self.service_location
            }
            if registry_token:
                headers[MicroHeaders.REGISTRY_TOKEN] = registry_token
            
            response = requests.post(self.registry_host, headers=headers, json={})
            if response.status_code >= 400:
                raise MicroJSError(response.status_code, response.text)
        
        return True
    
    async def handle_incoming_message(self, channel: str, message: Any) -> Dict[str, Any]:
        """Handle incoming pub/sub message"""
        if channel not in self._subscriptions:
            return {"results": [], "errors": []}
        
        results = []
        errors = []
        
        for sub_id, handler in self._subscriptions[channel].items():
            try:
                if asyncio.iscoroutinefunction(handler):
                    result = await handler(message)
                else:
                    result = handler(message)
                results.append(result)
            except Exception as e:
                logger.error(f"Handler error for channel {channel}: {e}")
                errors.append(str(e))
        
        return {"results": results, "errors": errors}


class MicroService:
    """Micro-JS service wrapper"""
    
    def __init__(self, name: str, handler: Callable, location: str, context: ServiceContext, server: HTTPServer, thread: Thread):
        self.name = name
        self.handler = handler
        self.location = location
        self.context = context
        self.server = server
        self.thread = thread
    
    def terminate(self):
        """Stop the service and unregister"""
        logger.info(f"Terminating service {self.name}...")
        
        # Unregister from registry
        registry_host = os.environ.get('MICRO_REGISTRY_URL')
        if not registry_host:
            raise MicroJSError(500, "MICRO_REGISTRY_URL environment variable not set")
        
        registry_token = os.environ.get('MICRO_REGISTRY_TOKEN')
        headers = {
            MicroHeaders.COMMAND: MicroCommands.SERVICE_UNREGISTER,
            MicroHeaders.SERVICE_NAME: self.name,
            MicroHeaders.SERVICE_LOCATION: self.location
        }
        if registry_token:
            headers[MicroHeaders.REGISTRY_TOKEN] = registry_token
        
        try:
            requests.post(registry_host, headers=headers, json={})
        except Exception as e:
            logger.error(f"Error unregistering service: {e}")
        
        # Shutdown server
        self.server.shutdown()
        self.thread.join(timeout=5)
        logger.info(f"Service {self.name} terminated")


def create_service_handler(service_fn: Callable, context: ServiceContext):
    """Create HTTP request handler for service"""
    
    class ServiceHandler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            # Suppress default HTTP logging
            pass
        
        def do_POST(self):
            try:
                # Read request body
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b'{}'
                
                # Parse JSON payload
                try:
                    payload = json.loads(body) if body else {}
                except json.JSONDecodeError:
                    payload = body.decode('utf-8')
                
                # Check for pub/sub message
                command = self.headers.get(MicroHeaders.COMMAND)
                if command == MicroCommands.PUBSUB_PUBLISH:
                    channel = self.headers.get(MicroHeaders.PUBSUB_CHANNEL)
                    if channel:
                        # Handle pub/sub message
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        result = loop.run_until_complete(context.handle_incoming_message(channel, payload))
                        loop.close()
                        
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps(result).encode('utf-8'))
                        return
                
                # Handle regular service call
                if asyncio.iscoroutinefunction(service_fn):
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    result = loop.run_until_complete(service_fn(payload))
                    loop.close()
                else:
                    result = service_fn(payload)
                
                # Send response
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(result).encode('utf-8'))
                
            except Exception as e:
                logger.error(f"Error handling request: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        
        def do_GET(self):
            # Health check
            if self.path == '/health':
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "healthy"}).encode('utf-8'))
            else:
                self.send_response(404)
                self.end_headers()
    
    return ServiceHandler


async def create_service(name_or_fn: Union[str, Callable], service_fn: Optional[Callable] = None, options: Optional[Dict[str, Any]] = None) -> MicroService:
    """
    Create and register a microservice
    
    Args:
        name_or_fn: Service name (str) or service function (Callable)
        service_fn: Service handler function (required if name_or_fn is str)
        options: Optional configuration options
    
    Returns:
        MicroService instance
    
    Example:
        # With named function
        async def my_service(payload):
            return {"result": "data"}
        
        service = await create_service("my_service", my_service)
        
        # Or with lambda/closure
        service = await create_service("my_service", lambda payload: {"result": "data"})
    """
    options = options or {}
    
    # Handle function-first calling style
    if callable(name_or_fn):
        service_fn = name_or_fn
        name = getattr(service_fn, '__name__', None) or f"Anon_{secrets.token_hex(4)}"
        if name == '<lambda>':
            name = f"Anon_{secrets.token_hex(4)}"
    else:
        name = name_or_fn
        if not callable(service_fn):
            raise ValueError("Service function must be callable")
    
    # Get registry host
    registry_host = os.environ.get('MICRO_REGISTRY_URL')
    if not registry_host:
        raise MicroJSError(500, "MICRO_REGISTRY_URL environment variable not set")
    
    # Determine service home (base URL without port)
    service_home = registry_host.rsplit(':', 1)[0]
    
    # Request port allocation from registry
    registry_token = os.environ.get('MICRO_REGISTRY_TOKEN')
    setup_headers = {
        MicroHeaders.COMMAND: MicroCommands.SERVICE_SETUP,
        MicroHeaders.SERVICE_NAME: name,
        MicroHeaders.SERVICE_HOME: service_home
    }
    if registry_token:
        setup_headers[MicroHeaders.REGISTRY_TOKEN] = registry_token
    
    logger.debug(f"Setting up service {name} with registry...")
    response = requests.post(registry_host, headers=setup_headers, json={})
    if response.status_code >= 400:
        raise MicroJSError(response.status_code, response.text)
    
    location = response.json() if response.headers.get('content-type') == 'application/json' else response.text.strip('"')
    port = int(location.split(':')[-1])
    
    logger.debug(f"Allocated location: {location}")
    
    # Create service context
    cache = {"services": {}}
    context = ServiceContext(cache, name, location, registry_host)
    
    # Bind context to service function if it accepts it
    def bound_service_fn(payload):
        # Check if function expects context as 'self'
        import inspect
        sig = inspect.signature(service_fn)
        if len(sig.parameters) >= 2 or (len(sig.parameters) == 1 and 'self' in sig.parameters):
            # Create a context object that can be passed as 'self'
            class ContextWrapper:
                def __init__(self, ctx):
                    self.call = ctx.call
                    self.publish = ctx.publish
                    self.subscribe = ctx.subscribe
                    self.unsubscribe = ctx.unsubscribe
            
            if asyncio.iscoroutinefunction(service_fn):
                async def wrapper(payload):
                    return await service_fn(ContextWrapper(context), payload)
                return asyncio.run(wrapper(payload))
            else:
                return service_fn(ContextWrapper(context), payload)
        else:
            return service_fn(payload)
    
    # Create HTTP server
    handler_class = create_service_handler(bound_service_fn, context)
    server = HTTPServer(('', port), handler_class)
    
    # Start server in background thread
    def serve():
        logger.info(f"Service '{name}' listening on {location}")
        server.serve_forever()
    
    thread = Thread(target=serve, daemon=True)
    thread.start()
    
    # Register with registry
    use_auth_service = options.get('useAuthService')
    register_headers = {
        MicroHeaders.COMMAND: MicroCommands.SERVICE_REGISTER,
        MicroHeaders.SERVICE_NAME: name,
        MicroHeaders.SERVICE_LOCATION: location
    }
    if use_auth_service:
        register_headers[MicroHeaders.USE_AUTH_SERVICE] = use_auth_service
    if registry_token:
        register_headers[MicroHeaders.REGISTRY_TOKEN] = registry_token
    
    response = requests.post(registry_host, headers=register_headers, json={})
    if response.status_code >= 400:
        server.shutdown()
        thread.join(timeout=5)
        raise MicroJSError(response.status_code, response.text)
    
    # Update cache with registry data
    registry_data = response.json()
    cache.update(registry_data)
    
    logger.info(f"Service '{name}' registered at {location}")
    
    return MicroService(name, service_fn, location, context, server, thread)


async def call_service(name: str, payload: Any = None, content_type: str = 'application/json', auth_token: Optional[str] = None) -> Any:
    """
    Call a microservice by name
    
    Args:
        name: Service name
        payload: Request payload
        content_type: Content type (default: application/json)
        auth_token: Optional authentication token
    
    Returns:
        Service response
    """
    registry_host = os.environ.get('MICRO_REGISTRY_URL')
    if not registry_host:
        raise MicroJSError(500, "MICRO_REGISTRY_URL environment variable not set")
    
    headers = {
        MicroHeaders.COMMAND: MicroCommands.SERVICE_CALL,
        MicroHeaders.SERVICE_NAME: name,
        'Content-Type': content_type
    }
    if auth_token:
        headers[MicroHeaders.AUTH_TOKEN] = auth_token
    
    logger.debug(f"Calling service: {name}")
    
    response = requests.post(registry_host, headers=headers, json=payload)
    if response.status_code >= 400:
        raise MicroJSError(response.status_code, response.text)
    
    try:
        return response.json()
    except json.JSONDecodeError:
        return response.text


async def create_route(path: str, service_name_or_fn: Union[str, Callable], data_type: str = 'application/json') -> Optional[MicroService]:
    """
    Create a route mapping URL path to a service
    
    Args:
        path: URL path (e.g., '/api/users')
        service_name_or_fn: Service name or function
        data_type: Content type (default: application/json)
    
    Returns:
        MicroService instance if function was provided, None otherwise
    """
    registry_host = os.environ.get('MICRO_REGISTRY_URL')
    if not registry_host:
        raise MicroJSError(500, "MICRO_REGISTRY_URL environment variable not set")
    
    server = None
    
    # If function provided, create service first
    if callable(service_name_or_fn):
        server = await create_service(service_name_or_fn)
        service_name = server.name
    else:
        service_name = service_name_or_fn
    
    # Register route with registry
    registry_token = os.environ.get('MICRO_REGISTRY_TOKEN')
    headers = {
        MicroHeaders.COMMAND: MicroCommands.ROUTE_REGISTER,
        MicroHeaders.SERVICE_NAME: service_name,
        MicroHeaders.ROUTE_PATH: path,
        MicroHeaders.ROUTE_DATATYPE: data_type or 'application/json',
        MicroHeaders.ROUTE_TYPE: 'route'
    }
    if registry_token:
        headers[MicroHeaders.REGISTRY_TOKEN] = registry_token
    
    response = requests.post(registry_host, headers=headers, json={})
    if response.status_code >= 400:
        if server:
            server.terminate()
        raise MicroJSError(response.status_code, response.text)
    
    logger.info(f"Route '{path}' → service '{service_name}'")
    return server


async def publish_message(channel: str, message: Any) -> Dict[str, Any]:
    """
    Publish a message to a pub/sub channel
    
    Args:
        channel: Channel name
        message: Message payload
    
    Returns:
        Dict with 'results' and 'errors' arrays
    """
    registry_host = os.environ.get('MICRO_REGISTRY_URL')
    if not registry_host:
        raise MicroJSError(500, "MICRO_REGISTRY_URL environment variable not set")
    
    registry_token = os.environ.get('MICRO_REGISTRY_TOKEN')
    headers = {
        MicroHeaders.COMMAND: MicroCommands.PUBSUB_PUBLISH,
        MicroHeaders.PUBSUB_CHANNEL: channel
    }
    if registry_token:
        headers[MicroHeaders.REGISTRY_TOKEN] = registry_token
    
    response = requests.post(registry_host, headers=headers, json=message)
    if response.status_code >= 400:
        raise MicroJSError(response.status_code, response.text)
    
    return response.json()


async def create_subscription(channel: str, handler: Callable, options: Optional[Dict[str, Any]] = None) -> MicroService:
    """
    Create a standalone subscription to a channel
    
    Args:
        channel: Channel name to subscribe to
        handler: Async function to handle messages
        options: Optional configuration options
    
    Returns:
        Subscription object with terminate() method
    """
    options = options or {}
    
    # Generate unique subscription service name
    sub_id = secrets.token_hex(4)
    service_name = f"subscription_{channel}_{sub_id}"
    
    logger.debug(f"Creating subscription for channel: {channel}, id: {sub_id}")
    
    # Create a service that handles messages
    async def subscription_handler(message):
        try:
            if asyncio.iscoroutinefunction(handler):
                result = await handler(message)
            else:
                result = handler(message)
            return result or {"status": "processed"}
        except Exception as e:
            logger.error(f"Subscription handler error for channel '{channel}': {e}")
            raise
    
    # Create service for subscription
    service = await create_service(service_name, subscription_handler, options)
    
    # Subscribe to channel
    await service.context.subscribe(channel, handler)
    
    logger.info(f"Subscription '{service_name}' listening on {service.location} for channel '{channel}'")
    
    return service


# Convenience synchronous wrappers for async functions
def create_service_sync(name_or_fn: Union[str, Callable], service_fn: Optional[Callable] = None, options: Optional[Dict[str, Any]] = None) -> MicroService:
    """Synchronous wrapper for create_service"""
    return asyncio.run(create_service(name_or_fn, service_fn, options))


def call_service_sync(name: str, payload: Any = None, content_type: str = 'application/json', auth_token: Optional[str] = None) -> Any:
    """Synchronous wrapper for call_service"""
    return asyncio.run(call_service(name, payload, content_type, auth_token))


def create_route_sync(path: str, service_name_or_fn: Union[str, Callable], data_type: str = 'application/json') -> Optional[MicroService]:
    """Synchronous wrapper for create_route"""
    return asyncio.run(create_route(path, service_name_or_fn, data_type))


def publish_message_sync(channel: str, message: Any) -> Dict[str, Any]:
    """Synchronous wrapper for publish_message"""
    return asyncio.run(publish_message(channel, message))


def create_subscription_sync(channel: str, handler: Callable, options: Optional[Dict[str, Any]] = None) -> MicroService:
    """Synchronous wrapper for create_subscription"""
    return asyncio.run(create_subscription(channel, handler, options))

