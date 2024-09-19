import uuid
from typing import cast

from dagster import asset, define_asset_job
from dagster._core.definitions.decorators.definitions_decorator import definitions
from dagster._core.definitions.definitions_class import Definitions
from dagster._core.definitions.definitions_loader import DefinitionsLoadContext
from dagster._core.definitions.repository_definition.repository_definition import (
    PendingRepositoryDefinition,
)
from dagster_powerbi import PowerBIToken, PowerBIWorkspace
from dagster_powerbi.resource import load_powerbi_defs

fake_token = uuid.uuid4().hex
resource = PowerBIWorkspace(
    credentials=PowerBIToken(api_token=fake_token),
    workspace_id="a2122b8f-d7e1-42e8-be2b-a5e636ca3221",
)
pbi_defs = resource.build_defs()


@asset
def my_materializable_asset():
    pass


pending_repo_from_cached_asset_metadata = cast(
    PendingRepositoryDefinition,
    Definitions.merge(
        Definitions(assets=[my_materializable_asset], jobs=[define_asset_job("all_asset_job")]),
        pbi_defs,
    ).get_inner_repository(),
)


@definitions
def reconstruction_metadata_defs(context: DefinitionsLoadContext) -> Definitions:
    pbi_defs = load_powerbi_defs(
        context,
        api_token=fake_token,
        workspace_id="a2122b8f-d7e1-42e8-be2b-a5e636ca3221",
        enable_refresh_semantic_models=False,
    )

    return Definitions.merge(
        Definitions(assets=[my_materializable_asset], jobs=[define_asset_job("all_asset_job")]),
        pbi_defs,
    )
