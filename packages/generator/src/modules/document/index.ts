import { ProtocolMethod } from "@ps-generator-bridge/sdk";
import { api, ws } from "@ps-generator-bridge/sdk/plugin";
import { BaseModule } from "../base";
import type { PsBridgeHost } from "../../plugin";
import { bridgeError } from "../../errors";
import { bodyRecord, type ApiRequestLike } from "../apiParams";

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
    const data = await this.jsx.executeSafe("Document/getDocumentInfo");
    if (!data) {
      this.currentDocument = null;
      throw bridgeError.noDocument();
    }
    this.currentDocument = data as PsDocument;
    return data as PsDocument;
  }

  @api("/document/current")
  async getCurrentDocumentApi(): Promise<PsDocument> {
    return this.getCurrentDocument();
  }

  @ws(ProtocolMethod.DocumentExport)
  async exportDocument(params: Record<string, any>) {
    if (!params.filePath) throw bridgeError.badRequest("filePath is required");
    return await this.jsx.executeSafe("Document/exportDocument", params);
  }

  @api({ method: "POST", url: "/document/export" })
  async exportDocumentApi(request: ApiRequestLike): Promise<unknown> {
    return this.exportDocument(bodyRecord(request));
  }

  @ws(ProtocolMethod.DocumentSave)
  async saveDocument(params: { savePath?: string }) {
    return await this.jsx.executeSafe("Document/saveDocument", params);
  }

  @api({ method: "POST", url: "/document/save" })
  async saveDocumentApi(request: ApiRequestLike): Promise<unknown> {
    return this.saveDocument(bodyRecord(request));
  }
}
