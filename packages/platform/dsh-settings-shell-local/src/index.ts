// Client-only bundle: the Cordis host entry is a no-op shell so the package
// participates in composition. All behaviour lives in the client bundle —
// the settings shell is browser DOM, there is nothing to do on the host side.
const name = "dsh-settings-shell";

function apply() {}

export { apply, name };
