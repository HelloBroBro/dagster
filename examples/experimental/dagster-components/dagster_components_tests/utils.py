from dagster import AssetKey, DagsterInstance
from dagster_components import __component_registry__
from dagster_components.core.component import Component, ComponentLoadContext, ComponentRegistry


def registry() -> ComponentRegistry:
    return ComponentRegistry(__component_registry__)


def script_load_context() -> ComponentLoadContext:
    return ComponentLoadContext(registry=registry(), resources={})


def get_asset_keys(component: Component) -> set[AssetKey]:
    return {
        key
        for key in component.build_defs(ComponentLoadContext.for_test())
        .get_asset_graph()
        .get_all_asset_keys()
    }


def assert_assets(component: Component, expected_assets: int) -> None:
    defs = component.build_defs(ComponentLoadContext.for_test())
    assert len(defs.get_asset_graph().get_all_asset_keys()) == expected_assets
    result = defs.get_implicit_global_asset_job_def().execute_in_process(
        instance=DagsterInstance.ephemeral()
    )
    assert result.success
