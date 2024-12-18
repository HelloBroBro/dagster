from dagster._core.definitions.asset_key import AssetKey
from dagster._core.definitions.asset_spec import AssetSpec
from dagster_tableau import DagsterTableauTranslator
from dagster_tableau.translator import TableauContentData, TableauWorkspaceData


def test_translator_sheet_spec(
    workspace_data: TableauWorkspaceData, sheet_id: str, workbook_id: str
) -> None:
    sheet = next(iter(workspace_data.sheets_by_id.values()))

    translator = DagsterTableauTranslator(workspace_data)
    asset_spec = translator.get_asset_spec(sheet)

    assert asset_spec.key.path == ["test_workbook", "sheet", "sales"]
    assert asset_spec.metadata == {
        "dagster-tableau/id": sheet_id,
        "dagster-tableau/workbook_id": workbook_id,
    }
    assert asset_spec.tags == {
        "dagster/storage_kind": "tableau",
        "dagster-tableau/asset_type": "sheet",
    }
    deps = list(asset_spec.deps)
    assert len(deps) == 1
    assert deps[0].asset_key == AssetKey(["superstore_datasource"])


def test_translator_dashboard_spec(
    workspace_data: TableauWorkspaceData, dashboard_id: str, workbook_id: str
) -> None:
    dashboard = next(iter(workspace_data.dashboards_by_id.values()))

    translator = DagsterTableauTranslator(workspace_data)
    asset_spec = translator.get_asset_spec(dashboard)

    assert asset_spec.key.path == ["test_workbook", "dashboard", "dashboard_sales"]
    assert asset_spec.metadata == {
        "dagster-tableau/id": dashboard_id,
        "dagster-tableau/workbook_id": workbook_id,
    }
    assert asset_spec.tags == {
        "dagster/storage_kind": "tableau",
        "dagster-tableau/asset_type": "dashboard",
    }
    deps = list(asset_spec.deps)
    assert len(deps) == 1
    assert deps[0].asset_key == AssetKey(["test_workbook", "sheet", "sales"])


def test_translator_data_source_spec(
    workspace_data: TableauWorkspaceData, data_source_id: str
) -> None:
    data_source = next(iter(workspace_data.data_sources_by_id.values()))

    translator = DagsterTableauTranslator(workspace_data)
    asset_spec = translator.get_asset_spec(data_source)

    assert asset_spec.key.path == ["superstore_datasource"]
    assert asset_spec.metadata == {"dagster-tableau/id": data_source_id}
    assert asset_spec.tags == {
        "dagster/storage_kind": "tableau",
        "dagster-tableau/asset_type": "data_source",
    }
    deps = list(asset_spec.deps)
    assert len(deps) == 0


class MyCustomTranslator(DagsterTableauTranslator):
    def get_asset_spec(self, data: TableauContentData) -> AssetSpec:
        default_spec = super().get_asset_spec(data)
        return default_spec.replace_attributes(
            key=default_spec.key.with_prefix("prefix"),
            metadata={**default_spec.metadata, "custom": "metadata"},
        )


def test_translator_custom_metadata(workspace_data: TableauWorkspaceData) -> None:
    sheet = next(iter(workspace_data.sheets_by_id.values()))

    translator = MyCustomTranslator(workspace_data)
    asset_spec = translator.get_asset_spec(sheet)

    assert "custom" in asset_spec.metadata
    assert asset_spec.metadata["custom"] == "metadata"
    assert asset_spec.key.path == ["prefix", "test_workbook", "sheet", "sales"]
    assert asset_spec.tags == {
        "dagster/storage_kind": "tableau",
        "dagster-tableau/asset_type": "sheet",
    }
