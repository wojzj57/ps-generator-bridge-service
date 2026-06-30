import { ProtocolMethod } from "@ps-generator-bridge/sdk";
import { ws } from "@ps-generator-bridge/sdk/plugin";
import { BaseModule } from "../base";
import type { PsBridgeHost } from "../../plugin";

export type PsDocument = {
  id: number;
  name: string;
  width: number;
  height: number;
  resolution: number;
  isDirty: boolean;
  filePath?: string;
};

/**
 * The Document module surface a Plugin reaches through `plugin.modules.document`
 * (RFC 0003). `DocumentModule implements` this; the SDK re-exports it via
 * src/contract.ts.
 */
export interface DocumentModuleApi {
  getCurrentDocument(): Promise<PsDocument>;
  exportDocument(params: Record<string, unknown>): Promise<unknown>;
  saveDocument(params: { savePath?: string }): Promise<unknown>;
}

export class DocumentModule extends BaseModule implements DocumentModuleApi {
  constructor(plugin: PsBridgeHost) {
    super("document", plugin);
  }

  public currentDocument: PsDocument | null = null;

  @ws(ProtocolMethod.DocumentCurrent)
  async getCurrentDocument() {
    const data = await this.plugin.jsx.execute("Document/getDocumentInfo");
    if (!data) throw new Error("No document is opened");
    return data as PsDocument;
  }

  @ws(ProtocolMethod.DocumentExport)
  async exportDocument(params: Record<string, any>) {
    if (!params.filePath) throw new Error("filePath is required");
    return await this.plugin.jsx.execute("Document/exportDocument", params);
  }

  @ws(ProtocolMethod.DocumentSave)
  async saveDocument(params: { savePath?: string }) {
    return await this.plugin.jsx.execute("Document/saveDocument", params);
  }
}
