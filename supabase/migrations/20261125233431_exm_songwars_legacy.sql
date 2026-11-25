-- Separate public history from EXM's redeemable ledger and the authoritative SongWars registration system.
create table if not exists exm_member.songwars_legacy_seasons (
  season text primary key,
  label text not null,
  held_on date,
  verification text not null check (verification in ('verified','archive','pending')),
  source text not null,
  credits jsonb not null
);
create table if not exists exm_member.songwars_legacy_teams (
  season text references exm_member.songwars_legacy_seasons,
  team text,
  name text not null,
  primary key(season,team)
);
create table if not exists exm_member.songwars_legacy_credits (
  season text,
  team text,
  person text references exm_member.roster_credits(handle),
  credited_as text not null,
  role text not null default 'artist' check(role = 'artist'),
  source text not null,
  primary key(season,person),
  foreign key(season,team) references exm_member.songwars_legacy_teams
);
create table if not exists exm_member.songwars_legacy_matches (
  season text references exm_member.songwars_legacy_seasons,
  match_key text,
  stage text not null,
  winner text not null,
  opponent text not null,
  winner_score numeric,
  opponent_score numeric,
  denominator integer,
  source text not null,
  verification text not null check(verification = 'verified'),
  primary key(season,match_key),
  foreign key(season,winner) references exm_member.songwars_legacy_teams,
  foreign key(season,opponent) references exm_member.songwars_legacy_teams,
  check(winner<>opponent),
  check((denominator is null and winner_score is null and opponent_score is null)
     or (denominator > 0 and winner_score between 0 and denominator and opponent_score between 0 and denominator))
);
create table if not exists exm_member.songwars_legacy_awards (
  season text references exm_member.songwars_legacy_seasons,
  person text references exm_member.roster_credits(handle),
  source_key text,
  legacy_points integer not null check(legacy_points in (10,20)),
  primary key(season,person,source_key)
);
create table if not exists exm_member.songwars_legacy_evidence (
  evidence_key text primary key,
  records jsonb not null
);

alter table exm_member.songwars_legacy_seasons enable row level security;
alter table exm_member.songwars_legacy_teams enable row level security;
alter table exm_member.songwars_legacy_credits enable row level security;
alter table exm_member.songwars_legacy_matches enable row level security;
alter table exm_member.songwars_legacy_awards enable row level security;
alter table exm_member.songwars_legacy_evidence enable row level security;
