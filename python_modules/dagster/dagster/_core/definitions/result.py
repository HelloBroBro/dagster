from typing import NamedTuple, Optional, Sequence

import dagster._check as check
from dagster._annotations import PublicAttr, experimental
from dagster._core.definitions.asset_check_result import AssetCheckResult
from dagster._core.definitions.data_version import DataVersion

from .events import (
    AssetKey,
    CoercibleToAssetKey,
)
from .metadata import MetadataUserInput


class AssetResult(
    NamedTuple(
        "_AssetResult",
        [
            ("asset_key", PublicAttr[Optional[AssetKey]]),
            ("metadata", PublicAttr[Optional[MetadataUserInput]]),
            ("check_results", PublicAttr[Sequence[AssetCheckResult]]),
            ("data_version", PublicAttr[Optional[DataVersion]]),
        ],
    )
):
    """Base class for MaterializeResult and ObserveResult."""

    def __new__(
        cls,
        *,  # enforce kwargs
        asset_key: Optional[CoercibleToAssetKey] = None,
        metadata: Optional[MetadataUserInput] = None,
        check_results: Optional[Sequence[AssetCheckResult]] = None,
        data_version: Optional[DataVersion] = None,
    ):
        asset_key = AssetKey.from_coercible(asset_key) if asset_key else None

        return super().__new__(
            cls,
            asset_key=asset_key,
            metadata=check.opt_nullable_mapping_param(
                metadata,
                "metadata",
                key_type=str,
            ),
            check_results=check.opt_sequence_param(
                check_results, "check_results", of_type=AssetCheckResult
            ),
            data_version=check.opt_inst_param(data_version, "data_version", DataVersion),
        )

    def check_result_named(self, check_name: str) -> AssetCheckResult:
        for check_result in self.check_results:
            if check_result.check_name == check_name:
                return check_result

        check.failed(f"Could not find check result named {check_name}")


class MaterializeResult(AssetResult):
    """An object representing a successful materialization of an asset. These can be returned from
    @asset and @multi_asset decorated functions to pass metadata or specify specific assets were
    materialized.

    Attributes:
        asset_key (Optional[AssetKey]): Optional in @asset, required in @multi_asset to discern which asset this refers to.
        metadata (Optional[MetadataUserInput]): Metadata to record with the corresponding AssetMaterialization event.
        check_results (Optional[Sequence[AssetCheckResult]]): Check results to record with the
            corresponding AssetMaterialization event.
        data_version (Optional[DataVersion]): The data version of the asset that was observed.
    """


@experimental
class ObserveResult(AssetResult):
    """An object representing a successful observation of an asset. These can be returned from
    @asset and @multi_asset decorated functions to pass metadata or specify that specific assets were
    observed. The @asset or @multi_asset must specify
    "dagster/asset_execution_type": "OBSERVATION" in its metadata for this to
    work.

    Attributes:
        asset_key (Optional[AssetKey]): Optional in @asset, required in @multi_asset to discern which asset this refers to.
        metadata (Optional[MetadataUserInput]): Metadata to record with the corresponding AssetMaterialization event.
        check_results (Optional[Sequence[AssetCheckResult]]): Check results to record with the
            corresponding AssetObservation event.
        data_version (Optional[DataVersion]): The data version of the asset that was observed.
    """
