import {MockedResponse} from '@apollo/client/testing';
import without from 'lodash/without';

import {generateDailyTimePartitions} from './PartitionHealthSummary.fixtures';
import {tokenForAssetKey} from '../../asset-graph/Utils';
import {
  AssetKeyInput,
  LaunchBackfillParams,
  PartitionDefinitionType,
  PartitionRangeStatus,
  buildAssetCheck,
  buildAssetChecks,
  buildAssetKey,
  buildAssetNode,
  buildConfigTypeField,
  buildDaemonHealth,
  buildDaemonStatus,
  buildDimensionDefinitionType,
  buildDimensionPartitionKeys,
  buildInstance,
  buildMaterializationEvent,
  buildMode,
  buildPartitionDefinition,
  buildPartitionSet,
  buildPartitionSets,
  buildRegularConfigType,
  buildRepository,
  buildRepositoryLocation,
  buildRun,
  buildRunLauncher,
  buildTimePartitionStatuses,
} from '../../graphql/types';
import {LAUNCH_PARTITION_BACKFILL_MUTATION} from '../../instance/backfill/BackfillUtils';
import {LaunchPartitionBackfillMutation} from '../../instance/backfill/types/BackfillUtils.types';
import {CONFIG_PARTITION_SELECTION_QUERY} from '../../launchpad/ConfigEditorConfigPicker';
import {ConfigPartitionSelectionQuery} from '../../launchpad/types/ConfigEditorConfigPicker.types';
import {LAUNCH_PIPELINE_EXECUTION_MUTATION} from '../../runs/RunUtils';
import {
  LaunchPipelineExecutionMutation,
  LaunchPipelineExecutionMutationVariables,
} from '../../runs/types/RunUtils.types';
import {LAUNCH_ASSET_WARNINGS_QUERY} from '../LaunchAssetChoosePartitionsDialog';
import {
  LAUNCH_ASSET_CHECK_UPSTREAM_QUERY,
  LAUNCH_ASSET_LOADER_QUERY,
  LAUNCH_ASSET_LOADER_RESOURCE_QUERY,
} from '../LaunchAssetExecutionButton';
import {asAssetKeyInput} from '../asInput';
import {LaunchAssetWarningsQuery} from '../types/LaunchAssetChoosePartitionsDialog.types';
import {
  LaunchAssetCheckUpstreamQuery,
  LaunchAssetLoaderQuery,
  LaunchAssetLoaderResourceQuery,
} from '../types/LaunchAssetExecutionButton.types';
import {PartitionHealthQuery} from '../types/usePartitionHealthData.types';
import {PARTITION_HEALTH_QUERY} from '../usePartitionHealthData';

const REPO = buildRepository({
  id: 'c22d9677b8089be89b1e014b9de34284962f83a7',
  name: 'repo',
  location: buildRepositoryLocation({
    id: 'test.py',
    name: 'test.py',
  }),
});

const OTHER_REPO = buildRepository({
  id: '000000000000000000000000000000000000000',
  name: 'other-repo',
  location: buildRepositoryLocation({
    id: 'other-location.py',
    name: 'other-location.py',
  }),
});

const BASE_CONFIG_TYPE_FIELD = buildConfigTypeField({
  name: 'config',
  isRequired: false,
  configType: buildRegularConfigType({
    givenName: 'Any',
    key: 'Any',
    description: null,
    isSelector: false,
    typeParamKeys: [],
    recursiveConfigTypes: [],
  }),
});

export const UNPARTITIONED_ASSET = buildAssetNode({
  id: 'test.py.repo.["unpartitioned_asset"]',
  groupName: 'mapped',
  hasMaterializePermission: true,
  repository: REPO,
  dependencyKeys: [],
  dependedByKeys: [],
  graphName: null,
  jobNames: ['__ASSET_JOB_7', 'my_asset_job'],
  opNames: ['unpartitioned_asset'],
  opVersion: null,
  description: null,
  computeKind: null,
  isPartitioned: false,
  isObservable: false,
  isExecutable: true,
  isMaterializable: true,
  assetKey: buildAssetKey({path: ['unpartitioned_asset']}),
  requiredResources: [],
  configField: BASE_CONFIG_TYPE_FIELD,
  assetChecksOrError: buildAssetChecks(),
  backfillPolicy: null,
  partitionDefinition: null,
});

export const CHECKED_ASSET = buildAssetNode({
  ...UNPARTITIONED_ASSET,
  id: 'test.py.repo.["checked_asset"]',
  jobNames: ['__ASSET_JOB_7', 'checks_included_job', 'checks_excluded_job'],
  assetKey: buildAssetKey({path: ['checked_asset']}),
  configField: BASE_CONFIG_TYPE_FIELD,
  assetChecksOrError: buildAssetChecks({
    checks: [
      buildAssetCheck({
        name: 'CHECK_1',
        assetKey: buildAssetKey({path: ['checked_asset']}),
        jobNames: ['checks_included_job', '__ASSET_JOB_0'],
      }),
    ],
  }),
});

export const UNPARTITIONED_SOURCE_ASSET = buildAssetNode({
  ...UNPARTITIONED_ASSET,
  id: 'test.py.repo.["unpartitioned_source_asset"]',
  isMaterializable: false,
  isObservable: true,
  assetKey: buildAssetKey({path: ['unpartitioned_source_asset']}),
});

export const UNPARTITIONED_NON_EXECUTABLE_ASSET = buildAssetNode({
  ...UNPARTITIONED_ASSET,
  id: 'test.py.repo.["unpartitioned_non_executable_asset"]',
  isExecutable: false,
  assetKey: buildAssetKey({path: ['unpartitioned_non_executable_asset']}),
});

export const UNPARTITIONED_ASSET_OTHER_REPO = buildAssetNode({
  ...UNPARTITIONED_ASSET,
  id: 'test.py.repo.["unpartitioned_asset_other_repo"]',
  opNames: ['unpartitioned_asset_other_repo'],
  assetKey: buildAssetKey({path: ['unpartitioned_asset_other_repo']}),
  repository: OTHER_REPO,
});

export const UNPARTITIONED_ASSET_WITH_REQUIRED_CONFIG = buildAssetNode({
  ...UNPARTITIONED_ASSET,
  id: 'test.py.repo.["unpartitioned_asset_with_required_config"]',
  opNames: ['unpartitioned_asset_with_required_config'],
  assetKey: buildAssetKey({
    path: ['unpartitioned_asset_with_required_config'],
  }),
  configField: {...BASE_CONFIG_TYPE_FIELD, isRequired: true},
  assetChecksOrError: buildAssetChecks(),
});

export const MULTI_ASSET_OUT_1 = buildAssetNode({
  ...UNPARTITIONED_ASSET,
  id: 'test.py.repo.["multi_asset_out_1"]',
  jobNames: ['__ASSET_JOB_7'],
  assetKey: buildAssetKey({path: ['multi_asset_out_1']}),
});

export const MULTI_ASSET_OUT_2 = buildAssetNode({
  ...UNPARTITIONED_ASSET,
  id: 'test.py.repo.["multi_asset_out_2"]',
  jobNames: ['__ASSET_JOB_7'],
  assetKey: buildAssetKey({path: ['multi_asset_out_2']}),
});

export const ASSET_DAILY_PARTITION_KEYS = generateDailyTimePartitions(
  new Date('2020-01-01'),
  new Date('2023-02-22'),
);

export const ASSET_DAILY = buildAssetNode({
  id: 'test.py.repo.["asset_daily"]',
  groupName: 'mapped',
  hasMaterializePermission: true,
  repository: REPO,
  dependencyKeys: [],
  dependedByKeys: [{__typename: 'AssetKey', path: ['asset_weekly']}],
  graphName: null,
  jobNames: ['__ASSET_JOB_7', 'my_asset_job'],
  opNames: ['asset_daily'],
  opVersion: null,
  description: null,
  computeKind: null,
  isPartitioned: true,
  isObservable: false,
  isExecutable: true,
  isMaterializable: true,
  assetKey: buildAssetKey({path: ['asset_daily']}),
  requiredResources: [],
  configField: BASE_CONFIG_TYPE_FIELD,
  assetChecksOrError: buildAssetChecks(),
  backfillPolicy: null,
  partitionDefinition: buildPartitionDefinition({
    name: 'Foo',
    type: PartitionDefinitionType.TIME_WINDOW,
    description: 'Daily, starting 2020-01-01 UTC.',
    dimensionTypes: [buildDimensionDefinitionType({name: 'default'})],
  }),
});

export const ASSET_WEEKLY = buildAssetNode({
  __typename: 'AssetNode',
  id: 'test.py.repo.["asset_weekly"]',
  groupName: 'mapped',
  hasMaterializePermission: true,
  repository: REPO,
  dependencyKeys: [
    buildAssetKey({path: ['asset_daily']}),
    buildAssetKey({path: ['asset_weekly_root']}),
  ],
  dependedByKeys: [],
  graphName: null,
  jobNames: ['__ASSET_JOB_8'],
  opNames: ['asset_weekly'],
  opVersion: null,
  description: null,
  computeKind: null,
  isPartitioned: true,
  isObservable: false,
  isExecutable: true,
  isMaterializable: true,
  assetKey: buildAssetKey({path: ['asset_weekly']}),
  requiredResources: [],
  configField: BASE_CONFIG_TYPE_FIELD,
  assetChecksOrError: buildAssetChecks(),
  backfillPolicy: null,
  partitionDefinition: buildPartitionDefinition({
    name: 'Foo',
    type: PartitionDefinitionType.TIME_WINDOW,
    description: 'Weekly, starting 2020-01-01 UTC.',
    dimensionTypes: [buildDimensionDefinitionType({name: 'default'})],
  }),
});

export const ASSET_WEEKLY_ROOT = buildAssetNode({
  ...ASSET_WEEKLY,
  id: 'test.py.repo.["asset_weekly_root"]',
  dependencyKeys: [],
  assetKey: buildAssetKey({path: ['asset_weekly_root']}),
  opNames: ['asset_weekly_root'],
  assetMaterializations: [
    buildMaterializationEvent({
      runId: '8fec6fcd-7a05-4f1c-8cf8-4bfd6965eeba',
    }),
  ],
});

export const buildLaunchAssetWarningsMock = (
  upstreamAssetKeys: AssetKeyInput[],
): MockedResponse<LaunchAssetWarningsQuery> => ({
  request: {
    query: LAUNCH_ASSET_WARNINGS_QUERY,
    variables: {upstreamAssetKeys: upstreamAssetKeys.map(asAssetKeyInput)},
  },
  result: {
    data: {
      __typename: 'Query',
      assetNodes: [],
      instance: buildInstance({
        daemonHealth: buildDaemonHealth({
          id: 'daemonHealth',
          daemonStatus: buildDaemonStatus({
            id: 'BACKFILL',
            healthy: false,
          }),
        }),
        runQueuingSupported: false,
        runLauncher: buildRunLauncher({name: 'DefaultRunLauncher'}),
      }),
    },
  },
});

export const PartitionHealthAssetDailyMaterializedRanges = [
  {
    status: PartitionRangeStatus.MATERIALIZED,
    startTime: 1662940800.0,
    endTime: 1663027200.0,
    startKey: '2022-09-12',
    endKey: '2022-09-12',
    __typename: 'TimePartitionRangeStatus' as const,
  },
  {
    status: PartitionRangeStatus.MATERIALIZED,
    startTime: 1663027200.0,
    endTime: 1667088000.0,
    startKey: '2022-09-13',
    endKey: '2022-10-29',
    __typename: 'TimePartitionRangeStatus' as const,
  },
  {
    status: PartitionRangeStatus.MATERIALIZED,
    startTime: 1668816000.0,
    endTime: 1670803200.0,
    startKey: '2022-11-19',
    endKey: '2022-12-11',
    __typename: 'TimePartitionRangeStatus' as const,
  },
  {
    status: PartitionRangeStatus.MATERIALIZED,
    startTime: 1671494400.0,
    endTime: 1674086400.0,
    startKey: '2022-12-20',
    endKey: '2023-01-18',
    __typename: 'TimePartitionRangeStatus' as const,
  },
  {
    status: PartitionRangeStatus.MATERIALIZED,
    startTime: 1676851200.0,
    endTime: 1676937600.0,
    startKey: '2023-02-20',
    endKey: '2023-02-20',
    __typename: 'TimePartitionRangeStatus' as const,
  },
];

export const PartitionHealthAssetDailyMock: MockedResponse<PartitionHealthQuery> = {
  request: {
    query: PARTITION_HEALTH_QUERY,
    variables: {
      assetKey: {
        path: ['asset_daily'],
      },
    },
  },
  result: {
    data: {
      __typename: 'Query',
      assetNodeOrError: buildAssetNode({
        id: 'test.py.repo.["asset_daily"]',
        partitionKeysByDimension: [
          buildDimensionPartitionKeys({
            name: 'default',
            partitionKeys: ASSET_DAILY_PARTITION_KEYS,
            type: PartitionDefinitionType.TIME_WINDOW,
          }),
        ],
        assetPartitionStatuses: buildTimePartitionStatuses({
          ranges: PartitionHealthAssetDailyMaterializedRanges,
        }),
      }),
    },
  },
};

export const ASSET_DAILY_PARTITION_KEYS_MISSING = without(
  ASSET_DAILY_PARTITION_KEYS,
  ...PartitionHealthAssetDailyMaterializedRanges.flatMap((r) =>
    generateDailyTimePartitions(new Date(r.startTime * 1000 - 1), new Date(r.endTime * 1000 - 1)),
  ),
);

export const PartitionHealthAssetWeeklyMock: MockedResponse<PartitionHealthQuery> = {
  request: {
    query: PARTITION_HEALTH_QUERY,
    variables: {
      assetKey: {
        path: ['asset_weekly'],
      },
    },
  },
  result: {
    data: {
      __typename: 'Query',
      assetNodeOrError: buildAssetNode({
        id: 'test.py.repo.["asset_weekly"]',
        partitionKeysByDimension: [
          buildDimensionPartitionKeys({
            name: 'default',
            type: PartitionDefinitionType.TIME_WINDOW,
            partitionKeys: generateDailyTimePartitions(
              new Date('2020-01-01'),
              new Date('2023-02-22'),
              7,
            ),
          }),
        ],
        assetPartitionStatuses: buildTimePartitionStatuses({
          ranges: [],
        }),
      }),
    },
  },
};

export const PartitionHealthAssetWeeklyRootMock: MockedResponse<PartitionHealthQuery> = {
  request: {
    query: PARTITION_HEALTH_QUERY,
    variables: {
      assetKey: {
        path: ['asset_weekly_root'],
      },
    },
  },
  result: {
    data: {
      __typename: 'Query',
      assetNodeOrError: buildAssetNode({
        id: 'test.py.repo.["asset_weekly_root"]',
        partitionKeysByDimension: [
          buildDimensionPartitionKeys({
            name: 'default',
            type: PartitionDefinitionType.TIME_WINDOW,
            partitionKeys: generateDailyTimePartitions(
              new Date('2020-01-01'),
              new Date('2023-02-22'),
              7,
            ),
          }),
        ],
        assetPartitionStatuses: buildTimePartitionStatuses({
          ranges: [],
        }),
      }),
    },
  },
};

export const buildLaunchAssetLoaderGenericJobMock = (jobName: string) => {
  const result: MockedResponse<LaunchAssetLoaderResourceQuery> = {
    request: {
      query: LAUNCH_ASSET_LOADER_RESOURCE_QUERY,
      variables: {
        pipelineName: jobName,
        repositoryLocationName: 'test.py',
        repositoryName: 'repo',
      },
    },
    result: {
      data: {
        __typename: 'Query',
        partitionSetsOrError: buildPartitionSets({results: []}),
        pipelineOrError: {
          id: '8e2d3f9597c4a45bb52fe9ab5656419f4329d4fb',
          modes: [
            buildMode({
              id: 'da3055161c528f4c839339deb4a362ec1be4f079-default',
              resources: [],
            }),
          ],
          __typename: 'Pipeline',
        },
      },
    },
  };
  return result;
};

export const LaunchAssetLoaderResourceJob7Mock: MockedResponse<LaunchAssetLoaderResourceQuery> = {
  request: {
    query: LAUNCH_ASSET_LOADER_RESOURCE_QUERY,
    variables: {
      pipelineName: '__ASSET_JOB_7',
      repositoryLocationName: 'test.py',
      repositoryName: 'repo',
    },
  },
  result: {
    data: {
      __typename: 'Query',
      partitionSetsOrError: {
        results: [
          buildPartitionSet({
            id: '5b10aae97b738c48a4262b1eca530f89b13e9afc',
            name: '__ASSET_JOB_7_partition_set',
          }),
        ],
        __typename: 'PartitionSets',
      },
      pipelineOrError: {
        id: '8e2d3f9597c4a45bb52fe9ab5656419f4329d4fb',
        modes: [
          {
            id: 'da3055161c528f4c839339deb4a362ec1be4f079-default',
            resources: [
              {
                name: 'io_manager',
                description:
                  'Built-in filesystem IO manager that stores and retrieves values using pickling.',
                configField: {
                  name: 'config',
                  isRequired: false,
                  configType: {
                    __typename: 'CompositeConfigType',
                    key: 'Shape.18b2faaf1efd505374f7f25fcb61ed59bd5be851',
                    description: null,
                    isSelector: false,
                    typeParamKeys: [],
                    fields: [
                      {
                        name: 'base_dir',
                        description: null,
                        isRequired: false,
                        configTypeKey: 'StringSourceType',
                        defaultValueAsJson: null,
                        __typename: 'ConfigTypeField',
                      },
                    ],
                    recursiveConfigTypes: [
                      {
                        __typename: 'CompositeConfigType',
                        key: 'Selector.2571019f1a5201853d11032145ac3e534067f214',
                        description: null,
                        isSelector: true,
                        typeParamKeys: [],
                        fields: [
                          {
                            name: 'env',
                            description: null,
                            isRequired: true,
                            configTypeKey: 'String',
                            defaultValueAsJson: null,
                            __typename: 'ConfigTypeField',
                          },
                        ],
                      },
                      {
                        __typename: 'RegularConfigType',
                        givenName: 'String',
                        key: 'String',
                        description: '',
                        isSelector: false,
                        typeParamKeys: [],
                      },
                      {
                        __typename: 'ScalarUnionConfigType',
                        key: 'StringSourceType',
                        description: null,
                        isSelector: false,
                        typeParamKeys: [
                          'String',
                          'Selector.2571019f1a5201853d11032145ac3e534067f214',
                        ],
                        scalarTypeKey: 'String',
                        nonScalarTypeKey: 'Selector.2571019f1a5201853d11032145ac3e534067f214',
                      },
                    ],
                  },
                  __typename: 'ConfigTypeField',
                },
                __typename: 'Resource',
              },
            ],
            __typename: 'Mode',
          },
        ],
        __typename: 'Pipeline',
      },
    },
  },
};

export const LaunchAssetLoaderResourceJob8Mock: MockedResponse<LaunchAssetLoaderResourceQuery> = {
  request: {
    query: LAUNCH_ASSET_LOADER_RESOURCE_QUERY,
    variables: {
      pipelineName: '__ASSET_JOB_8',
      repositoryLocationName: 'test.py',
      repositoryName: 'repo',
    },
  },
  result: {
    data: {
      __typename: 'Query',
      partitionSetsOrError: {
        results: [
          buildPartitionSet({
            id: '129179973a9144278c2429d3ba680bf0f809a59b',
            name: '__ASSET_JOB_8_partition_set',
          }),
        ],
        __typename: 'PartitionSets',
      },
      pipelineOrError: {
        id: '8689a9dcd052f769b73d73dfe57e89065dac369d',
        modes: [
          {
            id: '719d9b2c592b98ae0f4a7ec570cae0a06667db31-default',
            resources: [
              {
                name: 'io_manager',
                description:
                  'Built-in filesystem IO manager that stores and retrieves values using pickling.',
                configField: {
                  name: 'config',
                  isRequired: false,
                  configType: {
                    __typename: 'CompositeConfigType',
                    key: 'Shape.18b2faaf1efd505374f7f25fcb61ed59bd5be851',
                    description: null,
                    isSelector: false,
                    typeParamKeys: [],
                    fields: [
                      {
                        name: 'base_dir',
                        description: null,
                        isRequired: false,
                        configTypeKey: 'StringSourceType',
                        defaultValueAsJson: null,
                        __typename: 'ConfigTypeField',
                      },
                    ],
                    recursiveConfigTypes: [
                      {
                        __typename: 'CompositeConfigType',
                        key: 'Selector.2571019f1a5201853d11032145ac3e534067f214',
                        description: null,
                        isSelector: true,
                        typeParamKeys: [],
                        fields: [
                          {
                            name: 'env',
                            description: null,
                            isRequired: true,
                            configTypeKey: 'String',
                            defaultValueAsJson: null,
                            __typename: 'ConfigTypeField',
                          },
                        ],
                      },
                      {
                        __typename: 'RegularConfigType',
                        givenName: 'String',
                        key: 'String',
                        description: '',
                        isSelector: false,
                        typeParamKeys: [],
                      },
                      {
                        __typename: 'ScalarUnionConfigType',
                        key: 'StringSourceType',
                        description: null,
                        isSelector: false,
                        typeParamKeys: [
                          'String',
                          'Selector.2571019f1a5201853d11032145ac3e534067f214',
                        ],
                        scalarTypeKey: 'String',
                        nonScalarTypeKey: 'Selector.2571019f1a5201853d11032145ac3e534067f214',
                      },
                    ],
                  },
                  __typename: 'ConfigTypeField',
                },
                __typename: 'Resource',
              },
            ],
            __typename: 'Mode',
          },
        ],
        __typename: 'Pipeline',
      },
    },
  },
};

export const LaunchAssetLoaderResourceMyAssetJobMock: MockedResponse<LaunchAssetLoaderResourceQuery> =
  {
    request: {
      query: LAUNCH_ASSET_LOADER_RESOURCE_QUERY,
      variables: {
        pipelineName: 'my_asset_job',
        repositoryLocationName: 'test.py',
        repositoryName: 'repo',
      },
    },
    result: {
      data: {
        __typename: 'Query',
        partitionSetsOrError: {
          results: [
            buildPartitionSet({
              id: '129179973a9144278c2429d3ba680bf0f809a59b',
              name: 'my_asset_job_partition_set',
            }),
          ],
          __typename: 'PartitionSets',
        },
        pipelineOrError: {
          id: '8689a9dcd052f769b73d73dfe57e89065dac369d',
          modes: [
            buildMode({
              id: '719d9b2c592b98ae0f4a7ec570cae0a06667db31-default',
              resources: [],
            }),
          ],
          __typename: 'Pipeline',
        },
      },
    },
  };

export const LaunchAssetLoaderAssetDailyWeeklyMock: MockedResponse<LaunchAssetLoaderQuery> = {
  request: {
    query: LAUNCH_ASSET_LOADER_QUERY,
    variables: {
      assetKeys: [{path: ['asset_daily']}, {path: ['asset_weekly']}],
    },
  },
  result: {
    data: {
      __typename: 'Query',
      assetNodes: [ASSET_DAILY, ASSET_WEEKLY],
      assetNodeDefinitionCollisions: [],
      assetNodeAdditionalRequiredKeys: [],
    },
  },
};

export const LaunchAssetCheckUpstreamWeeklyRootMock: MockedResponse<LaunchAssetCheckUpstreamQuery> =
  {
    request: {
      query: LAUNCH_ASSET_CHECK_UPSTREAM_QUERY,
      variables: {
        assetKeys: [{path: ['asset_weekly_root']}],
      },
    },
    result: {
      data: {
        __typename: 'Query',
        assetNodes: [ASSET_WEEKLY_ROOT],
      },
    },
  };

export function buildConfigPartitionSelectionLatestPartitionMock(
  partitionName: string,
  partitionSetName: string,
): MockedResponse<ConfigPartitionSelectionQuery> {
  return {
    request: {
      query: CONFIG_PARTITION_SELECTION_QUERY,
      variables: {
        partitionName,
        partitionSetName,
        repositorySelector: {
          repositoryLocationName: 'test.py',
          repositoryName: 'repo',
        },
      },
    },
    result: {
      data: {
        __typename: 'Query',
        partitionSetOrError: {
          __typename: 'PartitionSet',
          id: '5b10aae97b738c48a4262b1eca530f89b13e9afc',
          partition: {
            name: '2023-03-14',
            solidSelection: null,
            runConfigOrError: {
              yaml: '{}\n',
              __typename: 'PartitionRunConfig',
            },
            mode: 'default',
            tagsOrError: {
              results: [
                {
                  key: 'dagster/partition',
                  value: partitionName,
                  __typename: 'PipelineTag',
                },
                {
                  key: 'dagster/partition_set',
                  value: partitionSetName,
                  __typename: 'PipelineTag',
                },
              ],
              __typename: 'PartitionTags',
            },
            __typename: 'Partition',
          },
        },
      },
    },
  };
}

export const LOADER_RESULTS = [
  ASSET_DAILY,
  ASSET_WEEKLY,
  ASSET_WEEKLY_ROOT,
  UNPARTITIONED_ASSET,
  UNPARTITIONED_ASSET_WITH_REQUIRED_CONFIG,
  UNPARTITIONED_ASSET_OTHER_REPO,
  MULTI_ASSET_OUT_1,
  MULTI_ASSET_OUT_2,
  CHECKED_ASSET,
];

export const PartitionHealthAssetMocks = [
  PartitionHealthAssetWeeklyRootMock,
  PartitionHealthAssetWeeklyMock,
  PartitionHealthAssetDailyMock,
];

export function buildLaunchAssetLoaderMock(
  assetKeys: AssetKeyInput[],
  overrides: Partial<LaunchAssetLoaderQuery> = {},
): MockedResponse<LaunchAssetLoaderQuery> {
  return {
    request: {
      query: LAUNCH_ASSET_LOADER_QUERY,
      variables: {
        assetKeys: assetKeys.map(asAssetKeyInput),
      },
    },
    result: {
      data: {
        __typename: 'Query',
        assetNodeDefinitionCollisions: [],
        assetNodeAdditionalRequiredKeys: [],
        assetNodes: LOADER_RESULTS.filter((a) =>
          assetKeys.some((k) => tokenForAssetKey(k) === tokenForAssetKey(a.assetKey)),
        ),
        ...overrides,
      },
    },
  };
}

export function buildExpectedLaunchBackfillMutation(
  backfillParams: LaunchBackfillParams,
): MockedResponse<LaunchPartitionBackfillMutation> {
  return {
    request: {
      query: LAUNCH_PARTITION_BACKFILL_MUTATION,
      variables: {backfillParams},
    },
    result: jest.fn(() => ({
      data: {
        __typename: 'Mutation',
        launchPartitionBackfill: {__typename: 'LaunchBackfillSuccess', backfillId: 'backfillid'},
      },
    })),
  };
}

export function buildExpectedLaunchSingleRunMutation(
  executionParams: LaunchPipelineExecutionMutationVariables['executionParams'],
): MockedResponse<LaunchPipelineExecutionMutation> {
  return {
    request: {
      query: LAUNCH_PIPELINE_EXECUTION_MUTATION,
      variables: {executionParams},
    },
    result: jest.fn(() => ({
      data: {
        __typename: 'Mutation',
        launchPipelineExecution: {
          __typename: 'LaunchRunSuccess',
          run: buildRun({
            runId: 'RUN_ID',
            id: 'RUN_ID',
            pipelineName: executionParams['selector']['pipelineName']!,
          }),
        },
      },
    })),
  };
}
