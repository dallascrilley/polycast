/**
 * Thrown by a private, un-committed build-time config loader (console
 * profiles, captured native actions) when the file or the named entry is
 * simply absent — a not-yet-bootstrapped local environment, not a malformed
 * one. Emitters catch this specifically to skip the one target/command that
 * needs it instead of failing an entire build; any other error (malformed
 * JSON, a schema violation) still propagates and fails loud.
 */
export class MissingPrivateConfig extends Error {}
