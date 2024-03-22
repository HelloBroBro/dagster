import memoize from 'lodash/memoize';
import {useMemo} from 'react';

import {useStaticSetFilter} from './useStaticSetFilter';
import {DefinitionTag} from '../../graphql/types';
import {TruncatedTextWithFullTextOnHover} from '../../nav/getLeftNavItemsForOption';

const emptyArray: any[] = [];

export const useAssetTagFilter = ({
  allAssetTags,
  tags,
  setTags,
}: {
  allAssetTags: DefinitionTag[];
  tags?: null | DefinitionTag[];
  setTags?: null | ((s: DefinitionTag[]) => void);
}) => {
  const memoizedState = useMemo(() => tags?.map(memoizedDefinitionTag), [tags]);
  return useStaticSetFilter<DefinitionTag>({
    name: 'Tag',
    icon: 'tag',
    allValues: useMemo(
      () =>
        allAssetTags.map((value) => ({
          value,
          match: [value.key + ':' + value.value],
        })),
      [allAssetTags],
    ),
    menuWidth: '300px',
    renderLabel: ({value}) => {
      if (value.value === _NO_VALUE_SENTINEL) {
        return <TruncatedTextWithFullTextOnHover text={value.key} />;
      }
      return <TruncatedTextWithFullTextOnHover text={`${value.key}: ${value.value}`} />;
    },
    getStringValue: ({value, key}) => `${value}: ${key}`,
    state: memoizedState ?? emptyArray,
    onStateChanged: (values) => {
      setTags?.(Array.from(values));
    },
    matchType: 'all-of',
  });
};

const _NO_VALUE_SENTINEL = '__dagster_no_value';

const randomNumber = Math.random();
const memoizedDefinitionTag = memoize(
  ({key, value}: DefinitionTag) => {
    return {
      __typename: 'DefinitionTag' as const,
      key,
      value,
    };
  },
  // Use a sequence unlikely to appear in the key/value to uniquely memoize them
  ({key, value}) => `${key}\n!!\n$$${randomNumber}$$\n!n\n${value}`,
);

export function useAssetTagsForAssets(
  assets: {definition?: {tags: DefinitionTag[]} | null}[],
): DefinitionTag[] {
  return useMemo(
    () =>
      Array.from(
        new Set(
          assets
            .flatMap((a) => a.definition?.tags.map((tag) => JSON.stringify(tag)) ?? [])
            .filter((o) => o),
        ),
      ).map((jsonTag) => memoizedDefinitionTag(JSON.parse(jsonTag))),
    [assets],
  );
}

export function doesAssetTagFilterMatch({
  filterTags,
  assetTags,
}: {
  filterTags: DefinitionTag[];
  assetTags: DefinitionTag[];
}) {
  return doesFilterArrayMatchValueArray(filterTags, assetTags);
}

export function doesFilterArrayMatchValueArray<T, V>(
  filterArray: T[],
  valueArray: V[],
  isMatch: (value1: T, value2: V) => boolean = (val1, val2) =>
    JSON.stringify(val1) === JSON.stringify(val2),
) {
  if (filterArray.length && !valueArray.length) {
    return false;
  }
  return !filterArray.some(
    (filterTag) =>
      // If no asset tags match this filter tag return true
      !valueArray.find((value) => !isMatch(filterTag, value)),
  );
}
