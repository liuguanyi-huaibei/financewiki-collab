// IPC lifetime ties the server to its supervisor, including abrupt parent exit.
process.on("disconnect", () => process.exit(0));
await import("../node_modules/y-webrtc/bin/server.js");
