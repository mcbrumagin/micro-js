# Micro-JS Go Client

Go client library for the Micro-JS microservices framework.

## Status

🚧 **Coming Soon** - Go client library is currently in development.

## Planned Features

- Service creation and registration
- Service-to-service calls
- Route creation
- Pub/sub messaging
- Subscription handling

## Example (Preview)

```go
package main

import (
    "github.com/yourusername/microjs-go"
    "log"
)

func main() {
    // Create a service
    service, err := microjs.CreateService("my-service", func(payload map[string]interface{}) (interface{}, error) {
        return map[string]interface{}{
            "message": "Hello from Go!",
        }, nil
    })
    
    if err != nil {
        log.Fatal(err)
    }
    
    defer service.Terminate()
    
    // Keep service running
    select {}
}
```

## Contributing

Contributions are welcome! If you'd like to help develop the Go client, please:

1. Follow the same protocol as the Python client (see `../python/microjs.py`)
2. Implement the header-based communication protocol
3. Support async/concurrent operations
4. Include comprehensive examples

See the existing Python implementation for reference.

