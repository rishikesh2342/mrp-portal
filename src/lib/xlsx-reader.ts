type SheetInfo = { name: string; path: string };
type WorkbookData = { sheets: { name: string; rows: string[][] }[] };

function u16(view: DataView, offset: number) { return view.getUint16(offset, true); }
function u32(view: DataView, offset: number) { return view.getUint32(offset, true); }

async function inflateRaw(bytes: Uint8Array) {
  const Stream = DecompressionStream as unknown as new (format: string) => DecompressionStream;
  const copy = bytes.slice().buffer as ArrayBuffer;
  const stream = new Blob([copy]).stream().pipeThrough(new Stream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function xmlDocument(bytes: Uint8Array) {
  return new DOMParser().parseFromString(new TextDecoder().decode(bytes), "application/xml");
}

export async function readXlsx(file: File): Promise<WorkbookData> {
  const archive = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let eocd = -1;
  for (let i = Math.max(0, archive.length - 65557); i <= archive.length - 22; i++) {
    if (u32(view, i) === 0x06054b50) eocd = i;
  }
  if (eocd < 0) throw new Error("This file is not a readable .xlsx workbook.");
  const count = u16(view, eocd + 10);
  const directorySize = u32(view, eocd + 12);
  let cursor = u32(view, eocd + 16);
  const entries = new Map<string, { method: number; size: number; compressedSize: number; offset: number }>();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (u32(view, cursor) !== 0x02014b50) throw new Error("Workbook ZIP directory is damaged.");
    const method = u16(view, cursor + 10);
    const compressedSize = u32(view, cursor + 20);
    const size = u32(view, cursor + 24);
    const nameLength = u16(view, cursor + 28);
    const extraLength = u16(view, cursor + 30);
    const commentLength = u16(view, cursor + 32);
    const offset = u32(view, cursor + 42);
    const name = decoder.decode(archive.slice(cursor + 46, cursor + 46 + nameLength));
    entries.set(name, { method, size, compressedSize, offset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor < 0 || directorySize === 0) throw new Error("Workbook has no readable sheets.");
  const readEntry = async (name: string) => {
    const entry = entries.get(name);
    if (!entry) return new Uint8Array();
    const local = entry.offset;
    const nameLength = u16(view, local + 26);
    const extraLength = u16(view, local + 28);
    const start = local + 30 + nameLength + extraLength;
    const data = archive.slice(start, start + entry.compressedSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return inflateRaw(data);
    throw new Error(`Unsupported workbook compression method ${entry.method}.`);
  };
  const workbook = xmlDocument(await readEntry("xl/workbook.xml"));
  const relations = xmlDocument(await readEntry("xl/_rels/workbook.xml.rels"));
  const targets = new Map<string, string>();
  for (const relation of Array.from(relations.getElementsByTagName("Relationship"))) {
    targets.set(relation.getAttribute("Id") || "", relation.getAttribute("Target") || "");
  }
  const sheets: SheetInfo[] = Array.from(workbook.getElementsByTagName("sheet")).map((sheet) => {
    const target = targets.get(sheet.getAttribute("r:id") || "") || "";
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    return { name: sheet.getAttribute("name") || "Sheet", path };
  });
  const sharedDoc = xmlDocument(await readEntry("xl/sharedStrings.xml"));
  const shared = Array.from(sharedDoc.getElementsByTagName("si")).map((node) =>
    Array.from(node.getElementsByTagName("t")).map((text) => text.textContent || "").join(""),
  );
  const parsed = [];
  for (const sheet of sheets) {
    const doc = xmlDocument(await readEntry(sheet.path));
    const rows: string[][] = [];
    for (const rowNode of Array.from(doc.getElementsByTagName("row"))) {
      const row: string[] = [];
      for (const cell of Array.from(rowNode.getElementsByTagName("c"))) {
        const ref = cell.getAttribute("r") || "A1";
        const colLabel = ref.match(/^[A-Z]+/)?.[0] || "A";
        let col = 0;
        for (const char of colLabel) col = col * 26 + char.charCodeAt(0) - 64;
        col--;
        const type = cell.getAttribute("t");
        let value = cell.getElementsByTagName("v")[0]?.textContent || "";
        if (type === "s") value = shared[Number(value)] || "";
        else if (type === "inlineStr") value = Array.from(cell.getElementsByTagName("t")).map((item) => item.textContent || "").join("");
        row[col] = value;
      }
      rows.push(row.map((value) => value || ""));
    }
    parsed.push({ name: sheet.name, rows });
  }
  return { sheets: parsed };
}
