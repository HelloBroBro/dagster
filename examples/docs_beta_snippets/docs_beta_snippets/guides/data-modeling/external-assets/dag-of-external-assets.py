import dagster as dg

# Three external assets that depend on each other
raw_data = dg.AssetSpec("raw_data")
stg_data = dg.AssetSpec("stg_data", deps=[raw_data])
cleaned_data = dg.AssetSpec("cleaned_data", deps=[stg_data])


@dg.asset(deps=[cleaned_data])
def derived_data(): ...


defs = dg.Definitions(assets=[raw_data, stg_data, cleaned_data, derived_data])
