import pytest
from dagster import (
    AssetSpec,
    # doing this rename to make the test cases fit on a single line for readability
    AutomationCondition as SC,
    DailyPartitionsDefinition,
)

from dagster_tests.definitions_tests.auto_materialize_tests.base_scenario import run_request

from ..scenario_specs import ScenarioSpec
from .asset_condition_scenario import AutomationConditionScenarioState

one_parent = ScenarioSpec(asset_specs=[AssetSpec("A"), AssetSpec("downstream", deps=["A"])])
two_parents = ScenarioSpec(
    asset_specs=[AssetSpec("A"), AssetSpec("B"), AssetSpec("downstream", deps=["A", "B"])]
)

daily_partitions = DailyPartitionsDefinition(start_date="2020-01-01")
one_parent_daily = one_parent.with_asset_properties(partitions_def=daily_partitions)
two_parents_daily = two_parents.with_asset_properties(partitions_def=daily_partitions)


@pytest.mark.parametrize(
    ["expected_value_hash", "condition", "scenario_spec", "materialize_A"],
    [
        # cron condition returns a unique value hash if parents change, if schedule changes, if the
        # partitions def changes, or if an asset is materialized
        ("b965fde7adb65aefeaceccb72d1924f7", SC.cron("0 * * * *"), one_parent, False),
        ("455fa56d35fd9ae07bc9ee891ea109d7", SC.cron("0 * * * *"), one_parent, True),
        ("e038e2ffef6417fe048dbdb927b56fdf", SC.cron("0 0 * * *"), one_parent, False),
        ("80742dcd71a359a366d8312dfa283ffb", SC.cron("0 * * * *"), one_parent_daily, False),
        ("0179e633e3c1aac0d7af0dd3a3889f1a", SC.cron("0 * * * *"), two_parents, False),
        ("72bf7d1e533896a459ea3f46d30540d6", SC.cron("0 * * * *"), two_parents_daily, False),
        # same as above
        ("b60a8bd378adc06d0f6b20d521e64a86", SC.eager(), one_parent, False),
        ("c8d5928ae9965d3dc4c271b20121680d", SC.eager(), one_parent, True),
        ("ea699de7aef5356433e435dcaf4ab51e", SC.eager(), one_parent_daily, False),
        ("2819ba2e50803da9f146fd034e0df412", SC.eager(), two_parents, False),
        ("5f94b12ce4e5c9c424b9f37335d8cb82", SC.eager(), two_parents_daily, False),
        # missing condition is invariant to changes other than partitions def changes
        ("651bece3ee8bb50d1616924f0a65f3fd", SC.missing(), one_parent, False),
        ("651bece3ee8bb50d1616924f0a65f3fd", SC.missing(), one_parent, True),
        ("651bece3ee8bb50d1616924f0a65f3fd", SC.missing(), two_parents, False),
        ("ba2310926ab693fc05f1fc48a5b6e537", SC.missing(), two_parents_daily, False),
        ("ba2310926ab693fc05f1fc48a5b6e537", SC.missing(), one_parent_daily, False),
    ],
)
def test_value_hash(
    condition: SC, scenario_spec: ScenarioSpec, expected_value_hash: str, materialize_A: bool
) -> None:
    state = AutomationConditionScenarioState(
        scenario_spec, automation_condition=condition
    ).with_current_time("2024-01-01T00:00")

    state, _ = state.evaluate("downstream")
    if materialize_A:
        state = state.with_runs(run_request("A"))

    state, result = state.evaluate("downstream")
    assert result.value_hash == expected_value_hash
