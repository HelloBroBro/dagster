from dagster import (
    AssetOut,
    Definitions,
    OpExecutionContext,
    Out,
    Output,
    define_asset_job,
    graph_multi_asset,
    op,
)


# start_graph_backed_asset_foo
@op(out={"foo_1": Out(is_required=False), "foo_2": Out(is_required=False)})
def foo(context: OpExecutionContext, bar_1):
    # Selectively returns outputs based on selected assets
    if "foo_1" in context.selected_output_names:
        yield Output(bar_1 + 1, output_name="foo_1")
    if "foo_2" in context.selected_output_names:
        yield Output(bar_1 + 2, output_name="foo_2")


# end_graph_backed_asset_foo

# start_graph_backed_asset_example


@op(out={"bar_1": Out(), "bar_2": Out()})
def bar():
    return 1, 2


@op
def baz(foo_2, bar_2):
    return foo_2 + bar_2


@graph_multi_asset(
    outs={"foo_asset": AssetOut(), "baz_asset": AssetOut()}, can_subset=True
)
def my_graph_assets():
    bar_1, bar_2 = bar()
    foo_1, foo_2 = foo(bar_1)
    return {"foo_asset": foo_1, "baz_asset": baz(foo_2, bar_2)}


defs = Definitions(assets=[my_graph_assets], jobs=[define_asset_job("graph_asset")])

# end_graph_backed_asset_example
