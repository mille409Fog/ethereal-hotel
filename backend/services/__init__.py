"""Business logic, independent of HTTP.

Nothing in this package imports FastAPI: these modules take a session plus
already-validated input and raise domain errors, which the routers map to
status codes. That keeps the rules testable without a client.
"""
