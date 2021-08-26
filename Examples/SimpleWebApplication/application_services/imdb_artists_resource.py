from application_services.BaseApplicationResource import BaseApplicationResource
import database_services.RDBService as d_service


class IMDBArtistResource(BaseApplicationResource):

    def __init__(self):
        super().__init__()

    @classmethod
    def get_by_name_prefix(cls, name_prefix):
        res = d_service.get_by_prefix("imdbnew", "names_basic",
                                      "primary_name", name_prefix)
        return res