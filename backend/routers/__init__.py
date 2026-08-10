"""HTTP and WebSocket endpoints.

One module per resource, each exporting a ``router`` that ``main`` mounts.
Handlers stay thin: they validate, delegate to ``services``, and translate
domain errors into status codes.
"""
