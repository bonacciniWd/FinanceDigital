/**
 * @module exif-analyzer
 * @description Minimal JPEG/EXIF parser for document tampering detection.
 * Runs entirely in the browser (no external dependencies).
 *
 * Checks:
 * - Presence of EXIF data (cameras embed it; edited files often strip/alter it)
 * - Camera make/model (absent if not from a real camera)
 * - Software field (Photoshop, GIMP, Lightroom, etc. → tampered)
 * - DateTime vs DateTimeOriginal mismatch (file edited after capture)
 *
 * Canvas-captured images (getUserMedia → canvas.toBlob) have NO EXIF by design.
 * Pass `capturedViaStream = true` to mark them as trusted without suspicious flags.
 */

export type ExifData = {
  make?: string;
  model?: string;
  software?: string;
  dateTime?: string;
  dateTimeOriginal?: string;
  hasExif: boolean;
};

export type TamperScore = 0 | 1 | 2 | 3;
export type TamperLabel = 'ok' | 'suspeito' | 'possivelmente_adulterado' | 'adulterado';
export type CaptureSource = 'camera_ao_vivo' | 'camera_nativa' | 'desconhecido';

export type TamperAnalysis = {
  exif: ExifData;
  suspicious: boolean;
  flags: string[];
  score: TamperScore;
  label: TamperLabel;
  source: CaptureSource;
};

const EDITING_SOFTWARE = [
  'photoshop', 'lightroom', 'gimp', 'affinity', 'capture one',
  'snapseed', 'facetune', 'meitu', 'picsart', 'pixlr', 'vsco',
  'canva', 'paint.net', 'darktable', 'rawtherapee', 'acdsee',
  'fotor', 'befunky', 'photoscape', 'lensa',
];

function readAscii(buffer: ArrayBuffer, byteOffset: number, count: number): string {
  try {
    const bytes = new Uint8Array(buffer, byteOffset, Math.min(count, 512));
    let s = '';
    for (const b of bytes) { if (b === 0) break; s += String.fromCharCode(b); }
    return s.trim();
  } catch { return ''; }
}

function parseIFD(
  tiffView: DataView,
  buffer: ArrayBuffer,
  tiffBase: number,
  ifdOffset: number,
  isLE: boolean,
  exif: ExifData,
  depth = 0,
): void {
  if (depth > 3 || ifdOffset + 2 > tiffView.byteLength) return;
  const g16 = (o: number) => tiffView.getUint16(o, isLE);
  const g32 = (o: number) => tiffView.getUint32(o, isLE);
  let entries: number;
  try { entries = g16(ifdOffset); } catch { return; }

  for (let i = 0; i < entries; i++) {
    const e = ifdOffset + 2 + i * 12;
    if (e + 12 > tiffView.byteLength) break;
    try {
      const tag = g16(e);
      const type = g16(e + 2);
      const count = g32(e + 4);
      const raw = g32(e + 8);

      if (type === 2) {
        // ASCII string
        const absOffset = count <= 4 ? tiffBase + e + 8 : tiffBase + raw;
        const str = readAscii(buffer, absOffset, count);
        if (tag === 0x010F) exif.make = str;
        else if (tag === 0x0110) exif.model = str;
        else if (tag === 0x0131) exif.software = str;
        else if (tag === 0x0132) exif.dateTime = str;
        else if (tag === 0x9003) exif.dateTimeOriginal = str;
      } else if (type === 4 && (tag === 0x8769 || tag === 0xA005)) {
        // ExifIFD or InteropIFD pointer
        parseIFD(tiffView, buffer, tiffBase, raw, isLE, exif, depth + 1);
      }
    } catch { /* skip bad entry */ }
  }
}

/** Score 0 flags */
const flagScore: Record<string, TamperScore> = {
  sem_exif_captura_ao_vivo: 0,
  sem_exif: 0,           // could be desktop camera — not suspicious by itself
  sem_dados_camera: 1,
  datas_divergentes: 2,
};

export async function analyzeDocument(
  file: File,
  capturedViaStream = false,
): Promise<TamperAnalysis> {
  // Canvas captures via getUserMedia have no EXIF — this is expected and OK.
  if (capturedViaStream) {
    return {
      exif: { hasExif: false },
      suspicious: false,
      flags: ['sem_exif_captura_ao_vivo'],
      score: 0,
      label: 'ok',
      source: 'camera_ao_vivo',
    };
  }

  // HEIC/HEIF = formato nativo do iPhone via câmera — confiável, sem EXIF parseável no browser.
  if (file.type.match(/^image\/(heic|heif)$/i)) {
    return {
      exif: { hasExif: false },
      suspicious: false,
      flags: ['heic_camera_nativa'],
      score: 0,
      label: 'ok',
      source: 'camera_nativa',
    };
  }

  // PNG / WEBP / GIF — formatos sem EXIF de câmera, mas não suspeitos por si só.
  if (file.type.match(/^image\/(png|webp|gif|bmp|tiff?)$/i)) {
    return {
      exif: { hasExif: false },
      suspicious: false,
      flags: ['sem_exif'],
      score: 0,
      label: 'ok',
      source: 'desconhecido',
    };
  }

  // Formatos realmente inesperados (PDF disfarçado, etc.)
  if (!file.type.match(/^image\/(jpeg|jpg)$/i)) {
    return {
      exif: { hasExif: false },
      suspicious: true,
      flags: ['formato_inesperado'],
      score: 1,
      label: 'suspeito',
      source: 'desconhecido',
    };
  }

  try {
    const buffer = await file.arrayBuffer();
    const top = new DataView(buffer);

    // Must start with JPEG SOI (FFD8)
    if (top.byteLength < 4 || top.getUint16(0) !== 0xFFD8) {
      return {
        exif: { hasExif: false },
        suspicious: true,
        flags: ['cabecalho_jpeg_invalido'],
        score: 2,
        label: 'possivelmente_adulterado',
        source: 'desconhecido',
      };
    }

    const exif: ExifData = { hasExif: false };
    let offset = 2;

    // Scan segments for APP1 (FFE1) with Exif header
    while (offset < top.byteLength - 4) {
      const marker = top.getUint16(offset);
      if (marker === 0xFFD9) break; // End of Image
      if ((marker & 0xFF00) !== 0xFF00) break; // Invalid marker

      const segLen = top.getUint16(offset + 2);

      if (marker === 0xFFE1 && segLen > 8) {
        // Check for "Exif\0\0"
        const h = [0, 1, 2, 3].map(n => String.fromCharCode(top.getUint8(offset + 4 + n))).join('');
        if (h === 'Exif') {
          exif.hasExif = true;
          const tiffBase = offset + 10; // skip APP1 marker (2) + length (2) + "Exif\0\0" (6)
          const tiffView = new DataView(buffer, tiffBase);
          const isLE = tiffView.getUint16(0) === 0x4949; // "II" = little-endian
          const ifdOffset = isLE ? tiffView.getUint32(4, true) : tiffView.getUint32(4, false);
          parseIFD(tiffView, buffer, tiffBase, ifdOffset, isLE, exif);
          break;
        }
      }
      offset += 2 + segLen;
    }

    // ── Evaluate ────────────────────────────────────────────────────────
    const flags: string[] = [];

    if (!exif.hasExif) {
      flags.push('sem_exif');
    } else {
      if (!exif.make && !exif.model) flags.push('sem_dados_camera');

      if (exif.software) {
        const sw = exif.software.toLowerCase();
        const match = EDITING_SOFTWARE.find(k => sw.includes(k));
        if (match) flags.push(`software_edicao_detectado:${exif.software}`);
      }

      if (exif.dateTime && exif.dateTimeOriginal && exif.dateTime !== exif.dateTimeOriginal) {
        flags.push('datas_divergentes');
      }
    }

    let score: TamperScore = 0;
    if (flags.some(f => f.startsWith('software_edicao_detectado'))) {
      score = 3;
    } else if (flags.includes('datas_divergentes')) {
      score = 2;
    } else if (flags.includes('sem_dados_camera') && exif.hasExif) {
      score = 1;
    }

    const source: CaptureSource = exif.make || exif.model ? 'camera_nativa' : 'desconhecido';
    const label: TamperLabel = score === 0 ? 'ok'
      : score === 1 ? 'suspeito'
      : score === 2 ? 'possivelmente_adulterado'
      : 'adulterado';

    return { exif, suspicious: score > 0, flags, score, label, source };
  } catch {
    return {
      exif: { hasExif: false },
      suspicious: false,
      flags: ['erro_leitura_exif'],
      score: 0,
      label: 'ok',
      source: 'desconhecido',
    };
  }
}

export function tamperBadgeProps(analysis: TamperAnalysis | null): {
  color: string;
  icon: string;
  text: string;
} {
  if (!analysis) return { color: 'text-muted-foreground', icon: '—', text: 'Não analisado' };
  switch (analysis.label) {
    case 'ok': return { color: 'text-green-700', icon: '✓', text: analysis.source === 'camera_ao_vivo' ? 'Câmera ao vivo' : 'OK' };
    case 'suspeito': return { color: 'text-amber-600', icon: '⚠', text: 'Suspeito' };
    case 'possivelmente_adulterado': return { color: 'text-orange-600', icon: '⚠', text: 'Possivelmente adulterado' };
    case 'adulterado': return { color: 'text-red-600', icon: '✕', text: 'Adulterado' };
  }
}
