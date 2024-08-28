# Airlift

Airlift is a toolkit for observing Airflow instances from within Dagster and for accelerating the migration of Airflow DAGs to Dagster assets.

## Goals

- Observe Airflow DAGs and their execution history with no changes to Airflow code
- Model and observe assets orchestrated by Airflow with no changes to Airflow code
- Enable a migration process that
  - Can be done task-by-task in any order with minimal coordination
  - Has task-by-task rollback to reduce risk
  - That retains Airflow DAG structure and execution history during the migration

## Process

- **Peer**
  - Observe an Airflow instance from within a Dagster Deployment via the Airflow REST API.
  - This loads every Airflow DAG as an asset definition and creates a sensor that polls Airflow for execution history.
- **Observe**
  - Add a mapping that maps the Airflow DAG and task id to a basket of definitions that you want to observe. (e.g. render the full lineage the dbt models an Airflow task orchestrates)
  - The sensor used for peering also polls for task execution history, and adds materializations to an observed asset when its corresponding task successfully executes
- **Migrate**
  - Selectively move execution of Airflow tasks to Dagster Software Defined Assets

## Compatibility

### REST API Availability

Airlift depends on the the availability of Airflow’s REST API. Airflow’s REST API was made stable in its 2.0 release (Dec 2020) and was introduced experimentally in 1.10 in August 2018. Currently Airflow requires the availability of the REST API.

- **OSS:** Stable as of 2.00
- **MWAA**
  - Note: only available in Airflow 2.4.3 or later on MWAA.
- **Cloud Composer:** No limitations as far as we know.
- **Astronomer:** No limitations as far as we know.

# Guide

The below guide will walk through the process of peering, observing, and migrating assets from an Airflow DAG to Dagster. We'll be working with a sample project, found in [`examples/tutorial-example`](./examples/tutorial-example/), which you can clone and use to follow along.

## Running Airflow locally

The tutorial example involves running a local Airflow instance. This can be done by running the following commands from the root of the `tutorial-example` directory.

First, install the required python packages:

```bash
make airflow_install
```

Next, scaffold the Airflow instance, and initialize the dbt project:

```bash
make airflow_setup
```

Finally, run the Airflow instance with environment variables set:

```bash
make airflow_run
```

You should now be able to access the Airflow UI at [http://localhost:8080](http://localhost:8080), with the default username and password set to `admin`.

You should be able to see the `rebuild_customers_list` DAG in the Airflow UI, made up of three tasks: `load_raw_customers`, `run_dbt_model`, and `export_customers`.

## Peering Dagster to your Airflow instance

The first step is to peer your Airflow instance with a Dagster code location, which will create an asset representation of each of your Airflow DAGs that you can view in Dagster. This process does not require any changes to your Airflow instance.

First, you will need to set up the `dagster-airlift` package in your Dagster environment:

```bash
pip install uv
uv pip install 'dagster-airlift[core]' dagster-webserver
```

Next, create a new Python file to hold your Dagster code. Create a `Definitions` object using `build_defs_from_airflow_instance`:

```python
# airlift.py

from dagster_airlift.core import (
    AirflowInstance,
    BasicAuthBackend,
    build_defs_from_airflow_instance,
)

defs = build_defs_from_airflow_instance(
    airflow_instance=AirflowInstance(
        # other backends available (e.g. MwaaSessionAuthBackend)
        auth_backend=BasicAuthBackend(
            webserver_url="http://localhost:8080",
            username="admin",
            password="admin",
        ),
        name="airflow_instance_one",
    )
)
```

This function creates:

- An external asset representing each DAG. This asset is marked as materialized whenever a DAG run completes.
- A sensor that polls the Airflow instance for operational information. This sensor is responsible for creating materializations when a DAG executes. The sensor must remain on in order to properly update execution status.

Let's set up some environment variables, and then point Dagster to see the asset created from our Airflow DAG:

```bash
# Set up environment variables to point to the examples/tutorial-example directory on your machine
export TUTORIAL_EXAMPLE_DIR=...
export DBT_PROJECT_DIR="$TUTORIAL_EXAMPLE_DIR/tutorial_example/shared/dbt"
export AIRFLOW_HOME="$TUTORIAL_EXAMPLE_DIR/.airflow_home"
dagster dev -f airlift.py
```

<p align="center">

![Peered asset in Dagster UI](./images/peer.svg)

</p>

If we kick off a run of the `rebuild_customers_list` DAG in Airflow, we should see the corresponding asset materialize in Dagster.

<p align="center">

![Materialized peer asset in Dagster UI](./images/peer_materialize.svg)

</p>

_Note: When the code location loads, Dagster will query the Airflow REST API in order to build a representation of your DAGs. In order for Dagster to reflect changes to your DAGs, you will need to reload your code location._

<details>
<summary>
*Peering to multiple instances*
</summary>

Airlift supports peering to multiple Airflow instances, as you can invoke `create_airflow_instance_defs` multiple times and combine them with `Definitions.merge`:

```python
from dagster import Definitions

from dagster_airlift.core import AirflowInstance, build_defs_from_airflow_instance

defs = Definitions.merge(
    build_defs_from_airflow_instance(
        airflow_instance=AirflowInstance(
            auth_backend=BasicAuthBackend(
                webserver_url="http://yourcompany.com/instance_one",
                username="admin",
                password="admin",
            ),
            name="airflow_instance_one",
        )
    ),
    build_defs_from_airflow_instance(
        airflow_instance=AirflowInstance(
            auth_backend=BasicAuthBackend(
                webserver_url="http://yourcompany.com/instance_two",
                username="admin",
                password="admin",
            ),
            name="airflow_instance_two",
        )
    ),
)
```

</details>

## Observing Assets

The next step is to represent our Airflow workflows more richly by observing the data assets that are produced by our tasks. In order to do this, we must define the relevant assets in the Dagster code location.

In our example, we have three sequential tasks:

1. `load_raw_customers` loads a CSV file of raw customer data into duckdb.
2. `run_dbt_model` builds a series of dbt models (from [jaffle shop](https://github.com/dbt-labs/jaffle_shop_duckdb)) combining customer, order, and payment data.
3. `export_customers` exports a CSV representation of the final customer file from duckdb to disk.

We will first create a set of asset specs that correspond to the assets produced by these tasks. We will then annotate these asset specs so that Dagster can associate them with the Airflow tasks that produce them.

The first and third tasks involve a single table each. We can manually construct `AssetSpec`s that match the assets which they build. Dagster provides the `dag_defs` and `task_defs` utilities to annotate asset specs with the tasks that produce them. Assets which are properly annotated will be materialized by the Airlift sensor once the corresponding task completes: These annotated specs are then
provided to the `defs` argument to `build_defs_from_airflow_instance`.

To build assets for our dbt invocation, we can use the Dagster-supplied factory `dbt_defs`, installable via `uv pip install dagster-airlift[dbt]`. This will load each dbt model as its own asset:

```python
# airlift.py

import os
from pathlib import Path

from dagster import AssetSpec, Definitions
from dagster_airlift.core import (
    AirflowInstance,
    BasicAuthBackend,
    build_defs_from_airflow_instance,
    dag_defs,
    task_defs,
)
from dagster_airlift.dbt import dbt_defs
from dagster_dbt import DbtProject


def dbt_project_path() -> Path:
    env_val = os.getenv("DBT_PROJECT_DIR")
    assert env_val
    return Path(env_val)


def rebuild_customer_list_defs() -> Definitions:
    return dag_defs(
        "rebuild_customers_list",
        task_defs(
            "load_raw_customers",
            Definitions(
                assets=[
                    AssetSpec(key=["raw_data", "raw_customers"]),
                ]
            ),
        ),
        task_defs(
            "build_dbt_models",
            # load rich set of assets from dbt project
            dbt_defs(
                manifest=dbt_project_path() / "target" / "manifest.json",
                project=DbtProject(dbt_project_path()),
            ),
        ),
        task_defs(
            "export_customers",
            Definitions(
                assets=[
                    # encode dependency on customers output
                    AssetSpec(key="customers_csv", deps=["customers"]),
                ]
            ),
        ),
    )


defs = build_defs_from_airflow_instance(
    airflow_instance=AirflowInstance(
        auth_backend=BasicAuthBackend(
            webserver_url="http://localhost:8080",
            username="admin",
            password="admin",
        ),
        name="airflow_instance_one",
    ),
    defs=rebuild_customer_list_defs(),
)
```

### Viewing observed assets

Once your assets are set up, you should be able to reload your Dagster definitions and see a full representation of the dbt project and other data assets in your code.

<p align="center">

![Observed asset graph in Dagster](./images/observe.svg)

</p>

Kicking off a run of the DAG in Airflow, you should see the newly created assets materialize in Dagster as each task completes.

_Note: There will be some delay between task completion and assets materializing in Dagster, managed by the sensor. This sensor runs every 30 seconds by default (you can reduce down to one second via the `minimum_interval_seconds` argument to `sensor`), so there will be some delay._

## Migrating Assets

Once you have created corresponding definitions in Dagster to your Airflow tasks, you can begin to selectively migrate execution of some or all of these assets to Dagster.

To begin migration on a DAG, first you will need a file to track migration progress. In your Airflow DAG directory, create a `migration_state` folder, and in it create a yaml file with the same name as your DAG. The included example at [`examples/tutorial-example/airflow_dags/migration_state`](.examples/tutorial-example/airflow_dags/migration_state) can be used as reference.

Given our example DAG `rebuild_customers_list` with three tasks, `load_raw_customers`, `run_dbt_model`, and `export_customers`, `migration_state/rebuild_customers_list.yaml` should look like the following:

```yaml
tasks:
  - id: load_raw_customers
    migrated: False
  - id: build_dbt_models
    migrated: False
  - id: export_customers
    migrated: False
```

Next, you will need to modify your Airflow DAG to make it aware of the migration status. This is already done in the example DAG:

```python
from dagster_airlift.in_airflow import mark_as_dagster_migrating
from dagster_airlift.migration_state import load_migration_state_from_yaml
from pathlib import Path
from airflow import DAG

dag = DAG("rebuild_customers_list")
...

mark_as_dagster_migrating(
    global_vars=globals(),
    migration_state=load_migration_state_from_yaml(
        Path(__file__).parent / "migration_state"
    ),
)
```

The DAG will now display its migration state in the Airflow UI.

<p align="center">

![Migration state rendering in Airflow UI](./images/state_in_airflow.png)

</p>

### Migrating individual tasks

In order to migrate a task, you must do two things:

1. First, ensure all associated assets are executable in Dagster by providing asset definitions in place of bare asset specs.
2. The `migrated: False` status in the `migration_state` YAML folder must be adjusted to `migrated: True`.

Any task marked as migrated will use the `DagsterOperator` when executed as part of the DAG. This operator will use the Dagster GraphQL API to initiate a Dagster run of the assets corresponding to the task.

The migration file acts as the source of truth for migration status. A task which has been migrated can be toggled back to run in Airflow (for example, if a bug in implementation was encountered) simply by editing the file to `migrated: False`.

#### Migrating common operators

For some common operator patterns, like our dbt operator, Dagster supplies factories to build software defined assets for our tasks. In fact, the `dbt_defs` factory used earlier already backs its assets with definitions, so we can toggle the migration status of the `build_dbt_models` task to `migrated: True` in the migration state file:

```yaml
tasks:
  - id: load_raw_customers
    migrated: False
  - id: build_dbt_models
    migrated: True
  - id: export_customers
    migrated: False
```

You can now run the `rebuild_customers_list` DAG in Airflow, and the `build_dbt_models` task will be executed in a Dagster run.

<p align="center">

![dbt build executing in Dagster](./images/migrated_dag.png)

</p>

#### Migrating custom operators

For all other operator types, we recommend creating a new factory function whose arguments match the inputs to your Airflow operator. Then, you can use this factory to build definitions for each Airflow task.

For example, our `load_raw_customers` task uses a custom `LoadCSVToDuckDB` operator. We'll define a function `load_csv_to_duckdb_defs` factory to build corresponding software-defined assets:

```python
from dataclasses import dataclass
from pathlib import Path
from typing import List

from dagster import AssetSpec, Definitions, multi_asset
from dagster_airlift.core import build_defs_from_airflow_instance, dag_defs, task_defs

from tutorial_example.shared.load_csv_to_duckdb import load_csv_to_duckdb

def load_csv_to_duckdb_defs(
    table_name: str,
    csv_path: Path,
    duckdb_path: Path,
    column_names: List[str],
    duckdb_schema: str,
    duckdb_database_name: str,
) -> Definitions:
    @multi_asset(specs=[AssetSpec(key=[duckdb_schema, table_name])])
    def _multi_asset() -> None:
        load_csv_to_duckdb(
            table_name=table_name,
            csv_path=csv_path,
            duckdb_path=duckdb_path,
            names=column_names,
            duckdb_schema=duckdb_schema,
            duckdb_database_name=duckdb_database_name,
        )

    return Definitions(assets=[_multi_asset])

defs = build_defs_from_airflow_instance(
    airflow_instance=airflow_instance,
    defs=dag_defs(
        "rebuild_customers_list",
        ...,
        task_defs(
            "load_raw_customers",
            load_csv_to_duckdb_defs(
                table_name="raw_customers",
                csv_path=Path(__file__).parent.parent / "airflow_dags" / "raw_customers.csv",
                duckdb_path=Path(os.environ["AIRFLOW_HOME"]) / "jaffle_shop.duckdb",
                column_names=[
                    "id",
                    "first_name",
                    "last_name",
                ],
                duckdb_schema="raw_data",
                duckdb_database_name="jaffle_shop",
            ),
        )
        ...
    ),
)
```
