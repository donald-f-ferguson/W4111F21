use IMDBRaw;

drop table if exists name_basics;
CREATE TABLE `name_basics` (
  `nconst` text,
  `primaryName` text,
  `birthYear` text,
  `deathYear` text,
  `primaryProfession` text,
  `knownForTitles` text
);

drop table if exists title_akas;
create table title_akas (
    titleid text,
    ordering text,
    title text,
    region text,
    language text,
    types text,
    attributes text,
    is_original_title text
);

drop table if exists title_basics;

create table title_basics (
    tconst text,
    title_type text,
    primary_title text,
    original_title text,
    is_adult text,
    start_year text,
    end_year text,
    runtime_minutes text,
    genres text
);

drop table if exists title_crew;
create table title_crew
(
    tconst    text,
    directors text,
    writers   text
);

drop table if exists title_episodes;
create table title_episodes (
    tconst text,
    parent_tconst text,
    season_number text,
    episode_number text);

drop table if exists title_principals;
create table title_principals (
    tconst text,
    ordering text,
    nconst text,
    category text,
    job text,
    characters text);

drop table if exists  title_ratings;
create table title_ratings (
    tconst text,
    average_rating text,
    no_votes text);