from dagster_tableau import DagsterTableauTranslator, TableauCloudWorkspace
from dagster_tableau.translator import TableauContentData

import dagster as dg

workspace = TableauCloudWorkspace(
    connected_app_client_id=dg.EnvVar("TABLEAU_CONNECTED_APP_CLIENT_ID"),
    connected_app_secret_id=dg.EnvVar("TABLEAU_CONNECTED_APP_SECRET_ID"),
    connected_app_secret_value=dg.EnvVar("TABLEAU_CONNECTED_APP_SECRET_VALUE"),
    username=dg.EnvVar("TABLEAU_USERNAME"),
    site_name=dg.EnvVar("TABLEAU_SITE_NAME"),
    pod_name=dg.EnvVar("TABLEAU_POD_NAME"),
)


# A translator class lets us customize properties of the built
# Tableau assets, such as the owners or asset key
class MyCustomTableauTranslator(DagsterTableauTranslator):
    def get_sheet_spec(self, data: TableauContentData) -> dg.AssetSpec:
        # We add a custom team owner tag to all sheets
        return super().get_sheet_spec(data)._replace(owners=["my_team"])


defs = workspace.build_defs(dagster_tableau_translator=MyCustomTableauTranslator)
