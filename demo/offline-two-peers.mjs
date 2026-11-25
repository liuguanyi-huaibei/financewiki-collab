import * as Y from "yjs";

const documentId = "financewiki-team/demo-momentum-factor";

// Seed one initial page state, then hydrate two independent device replicas.
const seed = new Y.Doc({ guid: documentId });
seed.getText("body").insert(
  0,
  "# Momentum factor\n\nDefinition: rank assets by historical returns.\n",
);
const initialState = Y.encodeStateAsUpdate(seed);

const peerA = new Y.Doc({ guid: documentId });
const peerB = new Y.Doc({ guid: documentId });
Y.applyUpdate(peerA, initialState);
Y.applyUpdate(peerB, initialState);

// Both devices are offline: each peer edits only its local replica.
peerA.getText("body").insert(0, "> Reviewed by member A\n\n");
peerB.getText("body").insert(
  peerB.getText("body").length,
  "\n\n## Calculation\n\nUse a 12-month lookback.\n",
);

// Reconnection: exchange each peer's Yjs state update.
const updateA = Y.encodeStateAsUpdate(peerA);
const updateB = Y.encodeStateAsUpdate(peerB);
Y.applyUpdate(peerA, updateB);
Y.applyUpdate(peerB, updateA);

const textA = peerA.getText("body").toString();
const textB = peerB.getText("body").toString();
const vectorsMatch = Buffer.from(Y.encodeStateVector(peerA)).equals(
  Buffer.from(Y.encodeStateVector(peerB)),
);

console.log("=== Peer A merged document ===\n");
console.log(textA);
console.log("\n=== Peer B merged document ===\n");
console.log(textB);
console.log("\n=== Convergence ===");
console.log("Document text identical:", textA === textB);
console.log("Yjs state vectors identical:", vectorsMatch);

if (textA !== textB || !vectorsMatch) {
  process.exitCode = 1;
}

seed.destroy();
peerA.destroy();
peerB.destroy();
