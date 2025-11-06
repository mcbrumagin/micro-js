# Micro-JS Python Client
# Import main functions for package-style usage

from .microjs import (
    # Core functions
    create_service,
    call_service,
    create_route,
    publish_message,
    create_subscription,
    
    # Sync wrappers
    create_service_sync,
    call_service_sync,
    create_route_sync,
    publish_message_sync,
    create_subscription_sync,
    
    # Classes
    MicroService,
    ServiceContext,
    MicroJSError,
    
    # Constants
    MicroHeaders,
    MicroCommands
)

__version__ = '1.0.0'
__all__ = [
    'create_service',
    'call_service',
    'create_route',
    'publish_message',
    'create_subscription',
    'create_service_sync',
    'call_service_sync',
    'create_route_sync',
    'publish_message_sync',
    'create_subscription_sync',
    'MicroService',
    'ServiceContext',
    'MicroJSError',
    'MicroHeaders',
    'MicroCommands'
]

