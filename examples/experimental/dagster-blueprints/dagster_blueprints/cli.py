import json
import sys
from importlib import import_module
from typing import List, Mapping, Optional

import click
from dagster import _check as check
from dagster._cli.workspace.cli_target import has_pyproject_dagster_block
from dagster._core.remote_representation.origin import ManagedGrpcPythonEnvCodeLocationOrigin
from dagster._core.workspace.load_target import PyProjectFileTarget
from dagster._utils.warnings import disable_dagster_warnings

from dagster_blueprints.load_from_yaml import YamlBlueprintsLoader

from .version import __version__


def get_python_modules_from_pyproject(pyproject_path: str) -> List[str]:
    """Utility to get the Python modules from a `pyproject.toml` file."""
    origins = PyProjectFileTarget(pyproject_path).create_origins()

    modules = []
    for origin in origins:
        if isinstance(origin, ManagedGrpcPythonEnvCodeLocationOrigin):
            module = origin.loadable_target_origin.module_name
            if module:
                modules.append(module)
    return modules


@click.command(
    help="Generates JSON schema files for Blueprint types specified by YamlBlueprintsLoader objects."
)
@click.option(
    "--loader-module",
    type=click.STRING,
    help="Path of Python module that contains YamlBlueprintsLoader objects. Defaults to Dagster project module, if `pyproject.toml` exists.",
)
@click.option(
    "--loader-name",
    type=click.STRING,
    help="Name of the YamlBlueprintsLoader object to generate a schema for. Required if the specified module contains multiple loaders.",
)
@click.option(
    "--pretty",
    "-p",
    is_flag=True,
    help="Whether to pretty-print the generated schema.",
)
def generate_schema(
    loader_module: Optional[str] = None, loader_name: Optional[str] = None, pretty: bool = False
) -> None:
    loaders: Mapping[str, YamlBlueprintsLoader] = load_blueprints_loaders_from_module_path_or_infer(
        loader_module
    )

    check.invariant(
        len(loaders) > 0, "No YamlBlueprintsLoader objects found in the provided module."
    )
    check.invariant(
        loader_name or len(loaders) == 1,
        "Must provide a loader name since the specified module contains multiple lodaers.",
    )

    check.invariant(
        loader_name is None or loader_name in loaders,
        f"Loader name {loader_name} not found in the provided module.",
    )

    loader = loaders[loader_name] if loader_name else next(iter(loaders.values()))
    click.echo(json.dumps(loader.model_json_schema(), indent=2 if pretty else None))


def load_blueprints_loaders_from_module_path_or_infer(
    module_path: Optional[str],
) -> Mapping[str, YamlBlueprintsLoader]:
    """Loads YamlBlueprintsLoader objects from the provided module path, or infers the module path from the current
    directory's `pyproject.toml` file. If no module path is provided and no `pyproject.toml` file is found, raises an
    error.
    """
    with disable_dagster_warnings():
        if module_path:
            return load_blueprints_loaders_from_module_path(module_path)
        else:
            check.invariant(
                has_pyproject_dagster_block("pyproject.toml"),
                "No `pyproject.toml` found in the current directory, or no `tool.dagster` block found in `pyproject.toml`.",
            )
            return {
                loader_name: loader
                for module in get_python_modules_from_pyproject("pyproject.toml")
                for loader_name, loader in load_blueprints_loaders_from_module_path(module).items()
            }


def load_blueprints_loaders_from_module_path(
    module_path: str,
) -> Mapping[str, YamlBlueprintsLoader]:
    sys.path.append(".")

    module = import_module(module_path)

    out = {}
    for attr in dir(module):
        value = getattr(module, attr)
        if isinstance(value, YamlBlueprintsLoader):
            out = {**out, attr: value}
    return out


def main():
    @click.group(
        commands=[generate_schema],
        context_settings={"max_content_width": 120, "help_option_names": ["-h", "--help"]},
    )
    @click.version_option(__version__, "--version", "-v")
    def group():
        """CLI tools for working with Dagster Blueprints."""

    return group()
