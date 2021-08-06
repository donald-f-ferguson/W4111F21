import pymysql
import json


def _get_db_connection():

    _db_connection = pymysql.connect(
        user="dbuser",
        password="dbuserdbuser",
        cursorclass=pymysql.cursors.DictCursor,
        host="localhost",
        port=3306
    )

    return _db_connection


def get_by_prefix(db_schema, table_name, column_name, value_prefix):

    conn = _get_db_connection()
    cur = conn.cursor()

    sql = "select * from " + db_schema + "." + table_name + " where " + \
        column_name + " like " + "'" + value_prefix + "%'"
    print("SQL Statement = " + cur.mogrify(sql, None))

    res = cur.execute(sql)
    res = cur.fetchall()

    conn.close()

    return res
