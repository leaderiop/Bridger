// Tagged errors of the host core (references/core ADR-BR-008). Identifiers and messages only.
import { Schema } from "effect"

export class DuplicatePlugin extends Schema.TaggedError<DuplicatePlugin>()("DuplicatePlugin", { id: Schema.String }) {}
export class DuplicateProvider extends Schema.TaggedError<DuplicateProvider>()("DuplicateProvider", { serviceId: Schema.String, providerId: Schema.String }) {}
export class DependencyCycle extends Schema.TaggedError<DependencyCycle>()("DependencyCycle", { path: Schema.Array(Schema.String) }) {}
export class InvalidDefinition extends Schema.TaggedError<InvalidDefinition>()("InvalidDefinition", { id: Schema.String, reason: Schema.String }) {}
export class UnknownRealm extends Schema.TaggedError<UnknownRealm>()("UnknownRealm", { id: Schema.String }) {}
export class DuplicateRealm extends Schema.TaggedError<DuplicateRealm>()("DuplicateRealm", { id: Schema.String }) {}
export type InstallError = DuplicatePlugin | DuplicateProvider | DependencyCycle | InvalidDefinition | UnknownRealm

export class ReplaceError extends Schema.TaggedError<ReplaceError>()("ReplaceError", { id: Schema.String, cause: Schema.String }) {}
export class UnknownPlugin extends Schema.TaggedError<UnknownPlugin>()("UnknownPlugin", { id: Schema.String }) {}
export class Conflict extends Schema.TaggedError<Conflict>()("Conflict", { id: Schema.String, pending: Schema.String }) {}
export class HostClosed extends Schema.TaggedError<HostClosed>()("HostClosed", {}) {}
export class CleanupError extends Schema.TaggedError<CleanupError>()("CleanupError", { id: Schema.String, message: Schema.String }) {}
/** `id`: the plugin whose leases did not drain; `target`: the plugin the call named, when different (BEH-BR-085). */
export class DrainTimeout extends Schema.TaggedError<DrainTimeout>()("DrainTimeout", { id: Schema.String, leases: Schema.Number, target: Schema.optional(Schema.String) }) {}
export class WouldDeadlock extends Schema.TaggedError<WouldDeadlock>()("WouldDeadlock", { id: Schema.String }) {}
export class ServiceUnavailable extends Schema.TaggedError<ServiceUnavailable>()("ServiceUnavailable", { serviceId: Schema.String }) {}
export class LeaseRevoked extends Schema.TaggedError<LeaseRevoked>()("LeaseRevoked", { serviceId: Schema.String }) {}
export class LeaseTimeout extends Schema.TaggedError<LeaseTimeout>()("LeaseTimeout", { serviceId: Schema.String }) {}
export class ActivationFailed extends Schema.TaggedError<ActivationFailed>()("ActivationFailed", { id: Schema.String, phase: Schema.String, message: Schema.String }) {}
export class PluginRemoved extends Schema.TaggedError<PluginRemoved>()("PluginRemoved", { id: Schema.String }) {}
export class Superseded extends Schema.TaggedError<Superseded>()("Superseded", { id: Schema.String }) {}
/** Decode failure of a plugin's configuration; the message never quotes a value (BEH-BR-103). */
export class ConfigInvalid extends Schema.TaggedError<ConfigInvalid>()("ConfigInvalid", { id: Schema.String, message: Schema.String }) {}
