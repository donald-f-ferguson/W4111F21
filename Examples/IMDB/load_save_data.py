import pandas as pd
import csv

from sqlalchemy import create_engine



def load_csv(fn):

    count = 0
    result = []

    with open(fn, "r") as in_file:
        csv_file = csv.DictReader(in_file, delimiter="\t")
        for c in csv_file:
            # print(c)
            result.append(c)
            count += 1

    print("Count = ", count)
    return result


def save_csv_to_db(csv_data, db_name, table_name):
    engine = create_engine('mysql+pymysql://dbuser:dbuserdbuser@localhost')
    ff = pd.DataFrame(csv_data)
    ff.to_sql(table_name, schema=db_name, con=engine, if_exists="replace", index=False)



result = load_csv("/Users/donaldferguson/Dropbox/Columbia/W4111F21/Data/IMDB/names_basics.tsv")
print(result[0])
save_csv_to_db(result, "IMDBRaw", "name_basics")
print("Written")
