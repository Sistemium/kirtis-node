import FormData from 'form-data';
import axios from 'sistemium-data/src/util/axios';
import lo from 'lodash';
// import strp from '../static/strp.json';

const API_URL = 'https://kalbu.vdu.lt/ajax-call';

export default async function (word) {
  const form = new FormData();
  form.append('word', word.toLocaleLowerCase());
  form.append('action', 'word_accent');
  const res = await axios.post(API_URL, form, { headers: form.getHeaders() });
  const { message } = res.data || {};
  const { accentInfo } = message ? JSON.parse(message) : {};
  return accentInfo;
}


export function accentInfoToStates(accentInfo) {
  if (!accentInfo) {
    return null;
  }
  const res = accentInfo
    .map(({ accented, information }) => accented.map(word => information.map(({ mi }) => ({
      word,
      ...miToState(mi),
    }))));
  return lo.flattenDeep(res);
}


/**
 *
 * @param {string} mi
 */
export function miToState(mi) {
  if (!mi) {
    return { state: [] };
  }
  const parts = mi.split(',')
    .map(lo.trim);
  const [cls] = parts;
  parts.splice(0, 1);
  const state = lo.flatten(lo.filter(parts.map(part => {
    const res = decodePart(part);
    return res || part.split(' ').map(sub => decodePart(sub));
  })));
  return {
    class: decodePart(cls),
    state,
  };
}

function decodePart(part) {
  return KEYS.get(part) || part;
}

/*

 */
const KEYS = new Map([
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
  ['būdn.', 'būdn.'], // Not found
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
