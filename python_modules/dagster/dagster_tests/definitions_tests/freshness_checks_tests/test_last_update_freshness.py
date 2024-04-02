# pyright: reportPrivateImportUsage=false

import datetime

import pendulum
import pytest
from dagster import (
    asset,
)
from dagster._core.definitions.asset_check_spec import AssetCheckSeverity
from dagster._core.definitions.freshness_checks.last_update import (
    build_last_update_freshness_checks,
)
from dagster._core.definitions.source_asset import SourceAsset
from dagster._core.instance import DagsterInstance
from dagster._seven.compat.pendulum import pendulum_freeze_time

from .conftest import add_new_event, assert_check_result


def test_params() -> None:
    @asset
    def my_asset():
        pass

    result = build_last_update_freshness_checks(
        assets=[my_asset], lower_bound_delta=datetime.timedelta(minutes=10)
    )
    assert len(result) == 1
    check = result[0]
    assert next(iter(check.check_keys)).asset_key == my_asset.key
    assert next(iter(check.check_specs)).metadata == {
        "dagster/freshness_params": {
            "dagster/lower_bound_delta": 600,
        }
    }

    result = build_last_update_freshness_checks(
        assets=[my_asset],
        deadline_cron="0 0 * * *",
        lower_bound_delta=datetime.timedelta(minutes=10),
    )
    check = result[0]
    assert next(iter(check.check_specs)).metadata == {
        "dagster/freshness_params": {
            "dagster/lower_bound_delta": 600,
            "dagster/deadline_cron": "0 0 * * *",
            "dagster/freshness_timezone": "UTC",
        }
    }

    result = build_last_update_freshness_checks(
        assets=[my_asset.key], lower_bound_delta=datetime.timedelta(minutes=10)
    )
    assert len(result) == 1
    assert next(iter(result[0].check_keys)).asset_key == my_asset.key

    src_asset = SourceAsset("source_asset")
    result = build_last_update_freshness_checks(
        assets=[src_asset], lower_bound_delta=datetime.timedelta(minutes=10)
    )
    assert len(result) == 1
    assert next(iter(result[0].check_keys)).asset_key == src_asset.key

    result = build_last_update_freshness_checks(
        assets=[my_asset, src_asset], lower_bound_delta=datetime.timedelta(minutes=10)
    )

    assert len(result) == 2
    assert next(iter(result[0].check_keys)).asset_key == my_asset.key

    with pytest.raises(Exception, match="Found duplicate assets"):
        build_last_update_freshness_checks(
            assets=[my_asset, my_asset], lower_bound_delta=datetime.timedelta(minutes=10)
        )

    result = build_last_update_freshness_checks(
        assets=[my_asset],
        lower_bound_delta=datetime.timedelta(minutes=10),
        deadline_cron="0 0 * * *",
        timezone="UTC",
    )
    assert len(result) == 1
    assert next(iter(result[0].check_keys)).asset_key == my_asset.key


@pytest.mark.parametrize(
    "use_materialization",
    [True, False],
    ids=["materialization", "observation"],
)
def test_different_event_types(
    pendulum_aware_report_dagster_event: None, use_materialization: bool, instance: DagsterInstance
) -> None:
    """Test that the freshness check works with different event types."""

    @asset
    def my_asset():
        pass

    start_time = pendulum.datetime(2021, 1, 1, 1, 0, 0, tz="UTC")
    lower_bound_delta = datetime.timedelta(minutes=10)

    with pendulum_freeze_time(start_time.subtract(minutes=(lower_bound_delta.seconds // 60) - 1)):
        add_new_event(instance, my_asset.key, is_materialization=use_materialization)
    with pendulum_freeze_time(start_time):
        freshness_checks = build_last_update_freshness_checks(
            assets=[my_asset],
            lower_bound_delta=lower_bound_delta,
        )
        assert_check_result(my_asset, instance, freshness_checks, AssetCheckSeverity.WARN, True)


def test_check_result_cron_non_partitioned(
    pendulum_aware_report_dagster_event: None,
    instance: DagsterInstance,
) -> None:
    """Move time forward and backward, with a freshness check parameterized with a cron, and ensure that the check passes and fails as expected."""

    @asset
    def my_asset():
        pass

    start_time = pendulum.datetime(2021, 1, 1, 1, 0, 0, tz="UTC")
    deadline_cron = "0 0 * * *"  # Every day at midnight.
    timezone = "UTC"
    lower_bound_delta = datetime.timedelta(minutes=10)

    freshness_checks = build_last_update_freshness_checks(
        assets=[my_asset],
        deadline_cron=deadline_cron,
        lower_bound_delta=lower_bound_delta,
        timezone=timezone,
    )

    freeze_datetime = start_time
    with pendulum_freeze_time(freeze_datetime):
        # With no events, check fails.
        assert_check_result(
            my_asset,
            instance,
            freshness_checks,
            AssetCheckSeverity.WARN,
            False,
            description_match="Asset is overdue. Expected an update within the last 1 hours, 10 minutes.",
        )

    # Add an event outside of the allowed time window. Check fails.
    lower_bound = pendulum.datetime(2021, 1, 1, 0, 0, 0, tz="UTC").subtract(minutes=10)
    with pendulum_freeze_time(lower_bound.subtract(minutes=1)):
        add_new_event(instance, my_asset.key)
    with pendulum_freeze_time(freeze_datetime):
        assert_check_result(my_asset, instance, freshness_checks, AssetCheckSeverity.WARN, False)

    # Go back in time and add an event within cron-lower_bound_delta.
    with pendulum_freeze_time(lower_bound.add(minutes=1)):
        add_new_event(instance, my_asset.key)
    # Now we expect the check to pass.
    with pendulum_freeze_time(freeze_datetime):
        assert_check_result(
            my_asset,
            instance,
            freshness_checks,
            AssetCheckSeverity.WARN,
            True,
            # This looks weird at first, but notice that we're one hours, after the last cron tick already.
            description_match="Asset is fresh. Expected an update within the last 1 hours, 10 minutes, and found an update 1 hours, 9 minutes ago.",
        )

    # Advance a full day. By now, we would expect a new event to have been added.
    # Since that is not the case, we expect the check to fail.
    freeze_datetime = freeze_datetime.add(days=1)
    with pendulum_freeze_time(freeze_datetime):
        assert_check_result(my_asset, instance, freshness_checks, AssetCheckSeverity.WARN, False)

    # Again, go back in time, and add an event within the time window we're checking.
    with pendulum_freeze_time(
        pendulum.datetime(2021, 1, 2, 0, 0, 0, tz="UTC").subtract(minutes=10).add(minutes=1)
    ):
        add_new_event(instance, my_asset.key)
    # Now we expect the check to pass.
    with pendulum_freeze_time(freeze_datetime):
        assert_check_result(my_asset, instance, freshness_checks, AssetCheckSeverity.WARN, True)


def test_check_result_bound_only(
    pendulum_aware_report_dagster_event: None,
    instance: DagsterInstance,
) -> None:
    """Move time forward and backward, with a freshness check parameterized with only a
    lower_bound_delta, and ensure that the check passes and fails as expected.
    """

    @asset
    def my_asset():
        pass

    start_time = pendulum.datetime(2021, 1, 1, 1, 0, 0, tz="UTC")
    lower_bound_delta = datetime.timedelta(minutes=10)

    freshness_checks = build_last_update_freshness_checks(
        assets=[my_asset],
        lower_bound_delta=lower_bound_delta,
    )

    freeze_datetime = start_time
    with pendulum_freeze_time(freeze_datetime):
        # With no events, check fails.
        assert_check_result(
            my_asset,
            instance,
            freshness_checks,
            AssetCheckSeverity.WARN,
            False,
            description_match="Asset is overdue. Expected an update within the last 10 minutes.",
        )

    # Add an event outside of the allowed time window. Check fails.
    lower_bound = pendulum.datetime(2021, 1, 1, 0, 50, 0, tz="UTC")
    with pendulum_freeze_time(lower_bound.subtract(minutes=1)):
        add_new_event(instance, my_asset.key)
    with pendulum_freeze_time(freeze_datetime):
        assert_check_result(my_asset, instance, freshness_checks, AssetCheckSeverity.WARN, False)

    # Go back in time and add an event within the allowed time window.
    with pendulum_freeze_time(lower_bound.add(minutes=1)):
        add_new_event(instance, my_asset.key)
    # Now we expect the check to pass.
    with pendulum_freeze_time(freeze_datetime):
        assert_check_result(
            my_asset,
            instance,
            freshness_checks,
            AssetCheckSeverity.WARN,
            True,
            description_match="Asset is fresh. Expected an update within the last 10 minutes, and found an update 9 minutes ago.",
        )
