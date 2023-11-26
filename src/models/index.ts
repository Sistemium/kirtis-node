import { BaseItem, Model, ModelConfig } from 'sistemium-data';
import MongoStoreAdapter, { mongoose } from 'sistemium-data-mongo';
import { CommonFieldsPlugin } from 'sistemium-data';
import mapValues from 'lodash/mapValues';
import fpOmitBy from 'lodash/fp/omitBy';
import { omitBy } from 'lodash';

// FIXME: id and cts handling must be done in adapter
const INTERNAL_FIELDS_RE = /^(_.*|cts)$/;
const omitInternal = fpOmitBy((_val, key) => INTERNAL_FIELDS_RE.test(key));

export class KirtisModel extends Model {

  normalizeItem(
    item: BaseItem,
    defaults: BaseItem = {},
    overrides: BaseItem = {},
  ): BaseItem {
    const { schema } = this
    const all = mapValues(schema, (keySchema, key) => {
      const res = ifUndefined(
        overrides[key],
        ifUndefined(item[key], defaults[key]),
      )
      if (res === undefined) {
        if (keySchema.patch || keySchema.default) {
          return res
        }
        return null
      }
      return res
    })
    return omitBy(omitInternal(all), (_val, key) => !schema[key])
  }

  constructor(config: ModelConfig) {
    const { schema = {} } = config
    super({ ...config, schema: { id: String, ...schema } })
  }

}

const adapter = new MongoStoreAdapter({ mongoose });

KirtisModel.useStoreAdapter(adapter)
  .plugin(new CommonFieldsPlugin());

export default {
};

export async function connect(url?: string) {
  return adapter.connect(url)
}

function ifUndefined(val1: any, val2: any) {
  return val1 === undefined ? val2 : val1
}
