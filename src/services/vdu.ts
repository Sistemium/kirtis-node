// Client for the VDU accentuation service (kalbu.vdu.lt) and the parser of its answers.
import lo from 'lodash';
import log from 'sistemium-debug';
import type { AccentInfo } from './caching';

const API_URL = 'https://kalbu.vdu.lt/ajax-call';
// VDU answers in about 0.3 s; during the October 2026 outage connections hung
const TIMEOUT_MS = 3000;
// After a failure, skip VDU for a while so lookups go straight to the engine
const COOLDOWN_MS = 60000;

const { debug, error } = log('vdu');

export interface VDUAccentInfo {
  accented: string[]
  information: { mi: string }[]
}

export class VduUnavailable extends Error {
}

let unavailableUntil = 0;

// Asks VDU about one word. Resolves to [] when VDU does not know the word,
// rejects with VduUnavailable when VDU cannot answer (error, timeout, unexpected body)
export async function askVdu(word: string): Promise<VDUAccentInfo[]> {
  if (Date.now() < unavailableUntil) {
    throw new VduUnavailable('Skipped after a recent failure');
  }
  const form = new FormData();
  form.append('word', word.toLocaleLowerCase('lt'));
  form.append('action', 'word_accent');
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const info = parseVduResponse(await response.json());
    debug('askVdu:', word, info.length);
    return info;
  } catch (e) {
    unavailableUntil = Date.now() + COOLDOWN_MS;
    const message = (e as Error).message;
    error('askVdu:', word, message);
    throw new VduUnavailable(message);
  }
}

// The body is { code, message } where message is JSON text: since October 2026 a list
// with one item per word ("[]" with code 502 for unknown words), before that { accentInfo }
export function parseVduResponse(body: unknown): VDUAccentInfo[] {
  const { message } = (body || {}) as { message?: unknown };
  if (typeof message !== 'string') {
    throw new Error('Unexpected VDU response');
  }
  const parsed = JSON.parse(message);
  const items: unknown[] = Array.isArray(parsed) ? lo.flatten(parsed) : parsed?.accentInfo || [];
  return items.filter((item): item is VDUAccentInfo => {
    const { accented, information } = (item || {}) as Partial<VDUAccentInfo>;
    return Array.isArray(accented) && Array.isArray(information);
  });
}

interface WordState {
  class?: string
  state: string[]
}

// Entries in the cache format. An entry needs a class; adverbs, particles and the like have no state.
export function accentInfoToStates(accentInfo: VDUAccentInfo[]): AccentInfo[] {
  if (!accentInfo?.length) {
    return [];
  }
  const res = accentInfo
    .map(({ accented, information }) => accented.map((word) => information.map(({ mi }) => ({
      word: word.trim(),
      ...miToState(mi),
    }))));
  const flat = lo.flattenDeep<AccentInfo>(res);
  return lo.uniqBy(flat, (v) => `${v.word}|${v.class}|${v.state.join('|')}`)
    .filter((i) => i.class);
}

export function miToState(mi: string): WordState {
  if (!mi) {
    return { state: [] };
  }
  const parts = mi.split(',')
    .map(lo.trim);
  const [cls] = parts;
  parts.splice(0, 1);
  const state = lo.flatten(lo.filter(parts.map((part) => {
    const res = KEYS.get(part);
    return res || part.split(' ').map((sub) => decodePart(sub));
  })));
  return {
    class: decodePart(cls),
    state,
  };
}

function decodePart(part: string) {
  return KEYS.get(part) || part;
}

// VDU abbreviations to kirtis ones (the keys of src/static/strp.json)
const KEYS = new Map<string, string>([
  // Lygis
  ['aukšt. l.', 'aukšt. l.'],
  ['aukšč. l.', 'aukšč. l.'],
  // Giminė
  ['mot. g.', 'mot.gim.'],
  ['vyr. g.', 'vyr.gim.'],
  ['bendr. g.', 'bendr.gim.'],
  ['bev. g.', 'bevrd.gim.'],
  // Linksnis
  ['vard.', 'V.'],
  ['kilm.', 'K.'],
  ['naud.', 'N.'],
  ['gal.', 'G.'],
  ['įnag.', 'Įn.'],
  ['viet.', 'Vt.'],
  ['šauksm.', 'Š.'],
  // Skaičius
  ['vns.', 'vnsk.'],
  ['dgs.', 'dgsk.'],
  // Laikas
  ['būs. l.', 'būs.l.'],
  ['būt. k. l.', 'būt.kart.l.'],
  ['būt. d. l.', 'būt.d.l.'],
  ['būt. l.', 'būt.l.'],
  ['es. l.', 'esam.l.'],
  // Grąžintinumas
  ['nesngr.', 'nesngr.'],
  ['sngr.', 'sngr.'],
  // Nuosaka
  ['ties. n.', 'Ties.'],
  ['tariam. n.', 'Tar.'],
  ['liep. n.', 'Liep.'],
  // Asmuo
  ['1 asm.', 'Iasm.'],
  ['2 asm.', 'IIasm.'],
  ['3 asm.', 'IIIasm.'],
  // Įvardis
  ['įvardž.', 'įvardž.'],
  ['neįvardž.', 'neįvardž.'],
  // Skaitvardis
  ['kiek.', 'kiekin.'],
  ['daugin.', 'daugin.'],
  ['kuop.', 'kuopin.'],
  ['kelint.', 'kelintin.'],
  // Rūšis
  ['neveik. r.', 'neveik.r.'],
  ['veik. r.', 'veik.r.'],
  // Kalbos dalis
  ['dkt.', 'dktv.'],
  ['bdv.', 'bdvr.'],
  ['vksm.', 'vksm.'],
  ['dlv.', 'dlv.'],
  ['pusd.', 'psdlv.'],
  ['pad.', 'padlv.'],
  ['būdn.', 'būdn.'],
  ['įv.', 'įvrd.'],
  ['sktv.', 'sktv.'],
  ['prv.', 'prvks.'],
  ['prl.', 'prlnks.'],
  ['jng.', 'jngt.'],
  ['dll.', 'dll.'],
  ['jst.', 'jstk.'],
  ['ištk.', 'ištk.'],
  //
  ['reik.', 'reikiamyb.'],
]);
