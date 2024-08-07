import {TextInput} from '@dagster-io/ui-components';
import * as React from 'react';
import {useMemo} from 'react';
import {useAssetDefinitionFilterState} from 'shared/assets/useAssetDefinitionFilterState.oss';

import {useAssetGroupSelectorsForAssets} from './AssetGroupSuggest';
import {AssetTableFragment} from './types/AssetTableFragment.types';
import {useAssetSearch} from './useAssetSearch';
import {CloudOSSContext} from '../app/CloudOSSContext';
import {isCanonicalStorageKindTag} from '../graph/KindTags';
import {useQueryPersistedState} from '../hooks/useQueryPersistedState';
import {useFilters} from '../ui/BaseFilters';
import {FilterObject} from '../ui/BaseFilters/useFilter';
import {useAssetGroupFilter} from '../ui/Filters/useAssetGroupFilter';
import {useAssetOwnerFilter, useAssetOwnersForAssets} from '../ui/Filters/useAssetOwnerFilter';
import {useAssetTagFilter, useAssetTagsForAssets} from '../ui/Filters/useAssetTagFilter';
import {useChangedFilter} from '../ui/Filters/useChangedFilter';
import {useCodeLocationFilter} from '../ui/Filters/useCodeLocationFilter';
import {
  useAssetKindTagsForAssets,
  useComputeKindTagFilter,
} from '../ui/Filters/useComputeKindTagFilter';
import {useStorageKindFilter} from '../ui/Filters/useStorageKindFilter';
import {WorkspaceContext} from '../workspace/WorkspaceContext';

const EMPTY_ARRAY: any[] = [];

export function useAssetCatalogFiltering(
  assets: AssetTableFragment[] | undefined,
  prefixPath: string[],
) {
  const [search, setSearch] = useQueryPersistedState<string | undefined>({queryKey: 'q'});

  const {
    filters,
    filterFn,
    setAssetTags,
    setChangedInBranch,
    setComputeKindTags,
    setGroups,
    setOwners,
    setCodeLocations,
    setStorageKindTags,
  } = useAssetDefinitionFilterState();

  const searchPath = (search || '')
    .replace(/(( ?> ?)|\.|\/)/g, '/')
    .toLowerCase()
    .trim();

  const pathMatches = useAssetSearch(
    searchPath,
    assets ?? (EMPTY_ARRAY as NonNullable<typeof assets>),
  );

  const filtered = React.useMemo(
    () => pathMatches.filter((a) => filterFn(a.definition ?? {})),
    [filterFn, pathMatches],
  );

  const allAssetGroupOptions = useAssetGroupSelectorsForAssets(pathMatches);
  const allComputeKindTags = useAssetKindTagsForAssets(pathMatches);
  const allAssetOwners = useAssetOwnersForAssets(pathMatches);

  const groupsFilter = useAssetGroupFilter({
    allAssetGroups: allAssetGroupOptions,
    assetGroups: filters.groups,
    setGroups,
  });
  const changedInBranchFilter = useChangedFilter({
    changedInBranch: filters.changedInBranch,
    setChangedInBranch,
  });
  const computeKindFilter = useComputeKindTagFilter({
    allComputeKindTags,
    computeKindTags: filters.computeKindTags,
    setComputeKindTags,
  });
  const ownersFilter = useAssetOwnerFilter({
    allAssetOwners,
    owners: filters.owners,
    setOwners,
  });

  const tags = useAssetTagsForAssets(pathMatches);
  const storageKindTags = useMemo(() => tags.filter(isCanonicalStorageKindTag), [tags]);
  const nonStorageKindTags = useMemo(
    () => tags.filter((tag) => !isCanonicalStorageKindTag(tag)),
    [tags],
  );

  const tagsFilter = useAssetTagFilter({
    allAssetTags: nonStorageKindTags,
    tags: filters.tags,
    setTags: setAssetTags,
  });
  const storageKindFilter = useStorageKindFilter({
    allAssetStorageKindTags: storageKindTags,
    storageKindTags: filters.storageKindTags,
    setStorageKindTags,
  });

  const {isBranchDeployment} = React.useContext(CloudOSSContext);
  const {allRepos} = React.useContext(WorkspaceContext);

  const reposFilter = useCodeLocationFilter({
    codeLocations: filters.codeLocations,
    setCodeLocations,
  });

  const uiFilters = React.useMemo(() => {
    const uiFilters: FilterObject[] = [
      groupsFilter,
      computeKindFilter,
      storageKindFilter,
      ownersFilter,
      tagsFilter,
    ];
    if (isBranchDeployment) {
      uiFilters.push(changedInBranchFilter);
    }
    if (allRepos.length > 1) {
      uiFilters.unshift(reposFilter);
    }
    return uiFilters;
  }, [
    allRepos.length,
    changedInBranchFilter,
    computeKindFilter,
    groupsFilter,
    isBranchDeployment,
    ownersFilter,
    reposFilter,
    storageKindFilter,
    tagsFilter,
  ]);
  const components = useFilters({filters: uiFilters});

  const filterInput = (
    <TextInput
      value={search || ''}
      style={{width: '30vw', minWidth: 150, maxWidth: 400}}
      placeholder={
        prefixPath.length ? `Filter asset keys in ${prefixPath.join('/')}…` : `Filter asset keys…`
      }
      onChange={(e: React.ChangeEvent<any>) => setSearch(e.target.value)}
    />
  );

  const isFiltered: boolean = !!(
    filters.changedInBranch?.length ||
    filters.computeKindTags?.length ||
    filters.storageKindTags?.length ||
    filters.groups?.length ||
    filters.owners?.length ||
    filters.codeLocations?.length
  );

  return {
    searchPath,
    activeFiltersJsx: components.activeFiltersJsx,
    filterButton: components.button,
    filterInput,
    isFiltered,
    filtered,
    computeKindFilter,
    storageKindFilter,
    renderFilterButton: components.renderButton,
  };
}
