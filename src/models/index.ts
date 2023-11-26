import { Model } from 'sistemium-data';
import MongoStoreAdapter from 'sistemium-data-mongo';
import CommonFieldsPlugin from 'sistemium-data/src/plugins/CommonFieldsPlugin';
import mapValues from 'lodash/mapValues';
import fpOmitBy from 'lodash/fp/omitBy';


// FIXME: id and cts handling must be done in adapter
const INTERNAL_FIELDS_RE = /^(_.*|cts)$/;
const omitInternal = fpOmitBy((val, key) => INTERNAL_FIELDS_RE.test(key));

export class KirtisModel extends Model {

  normalizeItem(item, defaults = {}, overrides = {}) {
    const { schema } = this;
    const all = mapValues(schema, (keySchema, key) => {
      const res = overrides[key] || item[key] || defaults[key];
      if (res === undefined) {
        if (keySchema.default) {
          return res;
        }
        return null;
      }
      return res;
    });
    return omitInternal(all);
  }

  constructor(config) {
    const { schema = {} } = config;
    super({ ...config, schema: { id: String, ...schema } });
  }

}

const adapter = new MongoStoreAdapter({});

KirtisModel.useStoreAdapter(adapter)
  .plugin(new CommonFieldsPlugin());

export default {
};

export async function connect(url) {
  return adapter.connect(url)
}
