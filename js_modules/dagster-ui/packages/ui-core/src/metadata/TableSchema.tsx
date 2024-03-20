import {gql} from '@apollo/client';
import {
  Box,
  Caption,
  Colors,
  Icon,
  IconName,
  Mono,
  Tag,
  TextInput,
  Tooltip,
} from '@dagster-io/ui-components';
import {Spacing} from '@dagster-io/ui-components/src/components/types';
import {createContext, useContext, useState} from 'react';

import {TableSchemaFragment} from './types/TableSchema.types';
import {Timestamp} from '../app/time/Timestamp';
import {StyledTableWithHeader} from '../assets/AssetEventMetadataEntriesTable';
import {assetDetailsPathForKey} from '../assets/assetDetailsPathForKey';
import {
  AssetKeyInput,
  JsonMetadataEntry,
  MaterializationEvent,
  TableSchemaMetadataEntry,
} from '../graphql/types';
import {Description} from '../pipelines/Description';
import {AnchorButton} from '../ui/AnchorButton';

type ITableSchema = TableSchemaFragment;

const MAX_CONSTRAINT_TAG_CHARS = 30;

interface ITableSchemaProps {
  schema: ITableSchema;
  schemaLoadTimestamp?: number | undefined;
  itemHorizontalPadding?: Spacing;
}

export const isCanonicalColumnSchemaEntry = (
  m: Pick<MaterializationEvent['metadataEntries'][0], '__typename' | 'label'>,
): m is TableSchemaMetadataEntry =>
  m.__typename === 'TableSchemaMetadataEntry' && m.label === 'dagster/column_schema';

export const isCanonicalColumnLineageEntry = (
  m: Pick<MaterializationEvent['metadataEntries'][0], '__typename' | 'label'>,
): m is JsonMetadataEntry => m.__typename === 'JsonMetadataEntry' && m.label === 'lineage';

export const TableSchemaLineageContext = createContext<{assetKey: AssetKeyInput | null}>({
  assetKey: null,
});

export const TableSchema = ({
  schema,
  schemaLoadTimestamp,
  itemHorizontalPadding,
}: ITableSchemaProps) => {
  const {assetKey} = useContext(TableSchemaLineageContext);

  const multiColumnConstraints = schema.constraints?.other || [];
  const [filter, setFilter] = useState('');
  const rows = schema.columns.filter(
    (s) => !filter || s.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <Box padding={{horizontal: itemHorizontalPadding}}>
      <Box padding={{bottom: 12}} flex={{alignItems: 'center', justifyContent: 'space-between'}}>
        <TextInput
          value={filter}
          style={{minWidth: 250}}
          icon="search"
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter columns"
        />
        {schemaLoadTimestamp && (
          <Caption color={Colors.textLighter()}>
            Updated <Timestamp timestamp={{ms: schemaLoadTimestamp}} />
          </Caption>
        )}
      </Box>
      {multiColumnConstraints.length > 0 && (
        <Box
          flex={{wrap: 'wrap', gap: 4, alignItems: 'center'}}
          padding={{horizontal: itemHorizontalPadding, vertical: 8}}
        >
          {multiColumnConstraints.map((constraint, i) => (
            <ArbitraryConstraintTag key={i} constraint={constraint} />
          ))}
        </Box>
      )}
      <StyledTableWithHeader>
        <thead>
          <tr>
            <td>Column name</td>
            <td style={{width: 200}}>Type</td>
            <td>Description</td>
            {assetKey ? <td style={{width: 56}} /> : undefined}
          </tr>
        </thead>
        <tbody>
          {rows.map((column) => (
            <tr key={column.name}>
              <td>
                <Mono>{column.name}</Mono>
              </td>
              <td>
                <TypeTag type={column.type} />
                {!column.constraints.nullable && NonNullableTag}
                {column.constraints.unique && UniqueTag}
                {column.constraints.other.map((constraint, i) => (
                  <ArbitraryConstraintTag key={i} constraint={constraint} />
                ))}
              </td>
              <td>
                <Description description={column.description} />
              </td>
              {assetKey ? (
                <td style={{padding: '4px 12px'}}>
                  <Tooltip content="View column lineage">
                    <AnchorButton
                      icon={<Icon name="column_lineage" />}
                      to={assetDetailsPathForKey(assetKey, {
                        view: 'lineage',
                        column: column.name,
                      })}
                    />
                  </Tooltip>
                </td>
              ) : undefined}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4}>
                <Caption color={Colors.textLight()}>No table schema columns</Caption>
              </td>
            </tr>
          )}
        </tbody>
      </StyledTableWithHeader>
    </Box>
  );
};

export const iconForColumnType = (type: string): IconName | null => {
  const lower = type.toLowerCase();
  if (lower.includes('bool')) {
    return 'datatype_bool';
  }
  if (['char', 'str', 'text', 'uuid'].some((term) => lower.includes(term))) {
    return 'datatype_string';
  }
  if (lower.includes('arr') || lower.includes('[]')) {
    return 'datatype_array';
  }
  if (['int', 'float', 'double', 'num', 'decimal'].some((term) => lower.includes(term))) {
    return 'datatype_number';
  }
  if (lower.includes('time') || lower.includes('date')) {
    return 'schedule';
  }
  return null;
};

export const TypeTag = ({type = ''}: {type: string}) => {
  if (type.trim().replace(/\?/g, '').length === 0) {
    // Do not render type '' or '?' or any other empty value.
    return <span />;
  }

  const icon = iconForColumnType(type);

  return (
    <Tag intent="none">
      <Box flex={{gap: 4}}>
        {icon ? <Icon name={icon} /> : <span style={{width: 16}} />}
        {type}
      </Box>
    </Tag>
  );
};

const NonNullableTag = <Tag intent="primary">non-nullable</Tag>;

const UniqueTag = <Tag intent="primary">unique</Tag>;

const ArbitraryConstraintTag = ({constraint}: {constraint: string}) => {
  if (constraint.length > MAX_CONSTRAINT_TAG_CHARS) {
    const content = constraint.substring(0, MAX_CONSTRAINT_TAG_CHARS - 3) + '...';
    return (
      <Tooltip content={<div>{constraint}</div>}>
        <Tag intent="primary">{content}</Tag>
      </Tooltip>
    );
  } else {
    return <Tag intent="primary">{constraint}</Tag>;
  }
};

export const TABLE_SCHEMA_FRAGMENT = gql`
  fragment TableSchemaFragment on TableSchema {
    columns {
      name
      description
      type
      constraints {
        ...ConstraintsForTableColumn
      }
    }
    constraints {
      other
    }
  }

  fragment ConstraintsForTableColumn on TableColumnConstraints {
    nullable
    unique
    other
  }
`;
