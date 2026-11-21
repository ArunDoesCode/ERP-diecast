// Namespace keys for the two-key form of pg_advisory_xact_lock(ns, id).
// One constant per feature so two features never share a lock by accident.

/** Rate contract activation: serialises the overlap check per supplier (BR-RFQ-46). */
export const RFQ_CONTRACT_LOCK_NS = 7101;
