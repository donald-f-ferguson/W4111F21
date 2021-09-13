# Import package to enable defining abstract classes in Python.
# Do not worry about understanding abstract base classes. This is just a class that defines
# some methods that subclasses must implement.
from abc import ABC, abstractmethod

import logging


class BaseDataTable(ABC):
    """
    The implementation classes (XXXDataTable) for CSV database, relational, etc. will extend this
    base class and implement the abstract methods. This approximates Java interfaces.
    """

    def __init__(self, table_name, connect_info, key_columns=None, debug=True):
        """

        :param table_name: Name of the table. Subclasses interpret the exact meaning of table_name.
        :param connect_info: Dictionary of parameters necessary to connect to the data. See examples in subclasses.
        :param key_columns: List, in order, of the columns (fields) that comprise the primary key.
            A primary key is a set of columns whose values are unique and uniquely identify a row. For Appearances, the columns are ['playerID', 'teamID', 'yearID']
        :param debug: If true, print debug messages.
        """
        pass

    @abstractmethod
    def find_by_primary_key(self, key_fields, field_list=None):
        """

        :param key_fields: The values for the key_columns, in order, to use to find a record. For example, for Appearances this could be ['willite01', 'BOS', '1960']
        :param field_list: A subset of the fields of the record to return. The table may have many additional columns, but the caller only requests this subset.
        :return: None, or a dictionary containing the requested columns/values for the row.
        """
        pass

    @abstractmethod
    def find_by_template(self, template, field_list=None, limit=None, offset=None, order_by=None):
        """

        :param template: A dictionary of the form { "field1" : value1, "field2": value2, ...}. The function will return a derived table containing the rows that match the template.
        :param field_list: A list of requested fields of the form, ['fielda', 'fieldb', ...]
        :param limit: Do not worry about this for now.
        :param offset: Do not worry about this for now.
        :param order_by: Do not worry about this for now.
        :return: A derived table containing the computed rows.
        """
        pass

    @abstractmethod
    def insert(self, new_record):
        """

        :param new_record: A dictionary representing a row to add to the set of records. Raises an exception if this
            creates a duplicate primary key.
        :return: None
        """
        pass

    @abstractmethod
    def delete_by_template(self, template):
        """

        Deletes all records that match the template.

        :param template: A template.
        :return: A count of the rows deleted.
        """
        pass

    @abstractmethod
    def delete_by_key(self, key_fields):
        """

        Deletes the record that match the key values.

        :param key_fields: List containing the values for the key columns
        :return: A count of the rows deleted.
        """
        pass

    @abstractmethod
    def update_by_template(self, template, new_values):
        """

        :param template: A template that defines which matching rows to update.
        :param new_values: A dictionary containing fields and the values to set for the corresponding fields
            in the records. This returns an error if the update would create a duplicate primary key. NO ROWS are
            update on this error.
        :return: The number of rows updates.
        """
        pass

    @abstractmethod
    def update_by_key(self, key_fields, new_values):
        """

        :param key_fields: List of values for primary key fields
        :param new_values: A dictionary containing fields and the values to set for the corresponding fields
            in the records. This returns an error if the update would create a duplicate primary key. NO ROWS are
            update on this error.
        :return: The number of rows updates.
        """
        pass
