use IMDBRaw;
SET GLOBAL local_infile = true;
load data local infile 'names_basics.tsv' into table name_basics fields terminated by '\t' ignore 1 rows;
load data local infile 'title_akas.tsv' into table titles_akas fields terminated by '\t' ignore 1 rows;
load data local infile 'titles_basics.tsv' into table title_basics fields terminated by '\t' ignore 1 rows;
load data local infile 'title_crew.tsv' into table title_crew fields terminated by '\t' ignore 1 rows;
load data local infile 'title_episode.tsv' into table title_episodes fields terminated by '\t' ignore 1 rows;
load data local infile 'title_principals.tsv' into table title_principals fields terminated by '\t' ignore 1 rows;

