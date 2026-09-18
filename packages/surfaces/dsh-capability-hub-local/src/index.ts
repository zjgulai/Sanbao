// Client-only bundle: the Cordis host entry is a no-op shell so the package
// participates in composition; the capability hub lives in the client bundle
// (read-only aggregation of other packages' loopback routes — it owns no fact
// of its own, so there is nothing for a host half to serve).
const name = "dsh-capability-hub";

function apply() {}

export { apply, name };
