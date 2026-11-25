// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { yCollab } from "y-codemirror.next";
import * as Y from "yjs";

const views: EditorView[] = [];
const docs: Y.Doc[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  for (const doc of docs.splice(0)) doc.destroy();
});

describe("CodeMirror 6 and Yjs binding", () => {
  it("propagates local CodeMirror edits and remote Yjs updates", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    docs.push(docA, docB);
    docA.getText("body").insert(0, "Shared");
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    const textA = docA.getText("body");
    const textB = docB.getText("body");
    const viewA = new EditorView({
      state: EditorState.create({
        doc: textA.toString(),
        extensions: [yCollab(textA, undefined)],
      }),
      parent: document.body,
    });
    const viewB = new EditorView({
      state: EditorState.create({
        doc: textB.toString(),
        extensions: [yCollab(textB, undefined)],
      }),
      parent: document.body,
    });
    views.push(viewA, viewB);

    viewA.dispatch({
      changes: { from: 6, to: 6, insert: " from A" },
    });
    expect(textA.toString()).toBe("Shared from A");

    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    expect(viewB.state.doc.toString()).toBe("Shared from A");

    viewB.dispatch({
      changes: { from: viewB.state.doc.length, to: viewB.state.doc.length, insert: " and B" },
    });
    expect(textB.toString()).toBe("Shared from A and B");

    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
    expect(viewA.state.doc.toString()).toBe("Shared from A and B");
    expect(viewA.state.doc.toString()).toBe(viewB.state.doc.toString());
  });
});
