import database_services.RDBService as db_service


def t1():

    res = db_service.get_by_prefix(
        "imdbnew", "names_basic", "primary_name", "Tom H"
    )
    print("t1 resule = ", res)


t1()


