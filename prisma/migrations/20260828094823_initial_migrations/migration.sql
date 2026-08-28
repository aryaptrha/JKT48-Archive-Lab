-- CreateEnum
CREATE TYPE "entity_category" AS ENUM ('PERSON', 'GROUP', 'MUSIC', 'EVENT', 'MEDIA', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "entity_type" AS ENUM ('MEMBER', 'STAFF', 'GROUP', 'TEAM', 'GENERATION', 'SUBUNIT', 'SONG', 'SINGLE', 'ALBUM', 'SETLIST', 'UNIT', 'CONCERT', 'THEATER_PERFORMANCE', 'ELECTION', 'AUDITION', 'GRADUATION', 'FORMATION', 'MAJOR_EVENT', 'TV_APPEARANCE', 'RADIO', 'MOVIE', 'DRAMA', 'PHOTOBOOK', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "source_type" AS ENUM ('FANDOM', 'WIKIPEDIA', 'OFFICIAL_SITE', 'OFFICIAL_SOCIAL', 'NEWS_ARTICLE', 'INTERVIEW', 'VIDEO', 'BOOK', 'FAN_ARCHIVE', 'PERSONAL_KNOWLEDGE', 'OTHER');

-- CreateEnum
CREATE TYPE "member_status" AS ENUM ('TRAINEE', 'ACTIVE', 'GRADUATED', 'ON_HIATUS', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "song_type" AS ENUM ('SINGLE_A_SIDE', 'SINGLE_B_SIDE', 'ALBUM_TRACK', 'SETLIST_SONG', 'UNIT_SONG', 'SOLO', 'OTHER');

-- CreateEnum
CREATE TYPE "album_type" AS ENUM ('SINGLE', 'STUDIO_ALBUM', 'MINI_ALBUM', 'COMPILATION', 'BEST_OF', 'OTHER');

-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('ELECTION', 'AUDITION', 'GRADUATION', 'FORMATION', 'TEAM_SHUFFLE', 'ANNIVERSARY', 'HANDSHAKE', 'FESTIVAL', 'OTHER');

-- CreateEnum
CREATE TYPE "media_type" AS ENUM ('TV_SHOW', 'RADIO_SHOW', 'MOVIE', 'DRAMA', 'PHOTOBOOK', 'MUSIC_VIDEO', 'DOCUMENTARY', 'OTHER');

-- CreateEnum
CREATE TYPE "organization_type" AS ENUM ('IDOL_GROUP', 'SISTER_GROUP', 'MANAGEMENT', 'LABEL', 'PRODUCTION', 'OTHER');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "mastery_scope" AS ENUM ('GENERATION', 'MEMBER', 'TEAM', 'SONG', 'ALBUM', 'EVENT', 'HISTORY', 'GLOBAL');

-- CreateEnum
CREATE TYPE "mastery_dimension" AS ENUM ('OVERALL', 'MEMBERS', 'HISTORY', 'TEAMS', 'SONGS', 'RELATIONSHIPS');

-- CreateEnum
CREATE TYPE "game_type" AS ENUM ('MYSTERY_MEMBER', 'CONNECT_THE_DOTS', 'MEMORY_RECONSTRUCTION', 'TIME_MACHINE_QUIZ', 'DAILY_CHALLENGE');

-- CreateEnum
CREATE TYPE "difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD', 'EXPERT', 'NIGHTMARE');

-- CreateEnum
CREATE TYPE "question_strategy" AS ENUM ('DIRECT_FACT', 'MULTIPLE_FACTS', 'RELATIONSHIP', 'INDIRECT_RELATIONSHIP', 'MULTI_HOP');

-- CreateEnum
CREATE TYPE "answer_mode" AS ENUM ('MULTIPLE_CHOICE', 'TEXT_INPUT', 'GRAPH_BUILD', 'FORM_RECONSTRUCTION');

-- CreateEnum
CREATE TYPE "game_session_status" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'BULK_IMPORT', 'CONFIG_CHANGE', 'DATA_HEALTH_RUN');

-- CreateEnum
CREATE TYPE "issue_severity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "issue_status" AS ENUM ('OPEN', 'IGNORED', 'RESOLVED');

-- CreateTable
CREATE TABLE "entities" (
    "id" TEXT NOT NULL,
    "entity_type" "entity_type" NOT NULL,
    "category" "entity_category" NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "image_url" TEXT,
    "metadata" JSONB,
    "active_from" DATE,
    "active_to" DATE,
    "prominence" INTEGER NOT NULL DEFAULT 50,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "source_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inverse_name" TEXT,
    "description" TEXT,
    "is_directional" BOOLEAN NOT NULL DEFAULT true,
    "is_temporal" BOOLEAN NOT NULL DEFAULT false,
    "allowed_source_types" "entity_type"[] DEFAULT ARRAY[]::"entity_type"[],
    "allowed_target_types" "entity_type"[] DEFAULT ARRAY[]::"entity_type"[],
    "is_quizzable" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relationship_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationships" (
    "id" TEXT NOT NULL,
    "source_entity_id" TEXT NOT NULL,
    "relationship_type_id" TEXT NOT NULL,
    "target_entity_id" TEXT NOT NULL,
    "valid_from" DATE,
    "valid_to" DATE,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "source_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "source_type" "source_type" NOT NULL DEFAULT 'OTHER',
    "retrieved_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "entity_id" TEXT NOT NULL,
    "stage_name" TEXT NOT NULL,
    "full_name" TEXT,
    "nickname" TEXT,
    "status" "member_status" NOT NULL DEFAULT 'ACTIVE',
    "birth_date" DATE,
    "birth_place" TEXT,
    "height_cm" INTEGER,
    "blood_type" TEXT,
    "zodiac" TEXT,
    "jikoshoukai" TEXT,
    "debut_date" DATE,
    "graduation_date" DATE,

    CONSTRAINT "members_pkey" PRIMARY KEY ("entity_id")
);

-- CreateTable
CREATE TABLE "generations" (
    "entity_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "audition_opened_at" DATE,
    "announced_at" DATE,
    "debuted_at" DATE,
    "initial_member_count" INTEGER,

    CONSTRAINT "generations_pkey" PRIMARY KEY ("entity_id")
);

-- CreateTable
CREATE TABLE "teams" (
    "entity_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "formed_at" DATE,
    "disbanded_at" DATE,
    "color_hex" TEXT,
    "catchphrase" TEXT,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("entity_id")
);

-- CreateTable
CREATE TABLE "songs" (
    "entity_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "original_title" TEXT,
    "song_type" "song_type" NOT NULL DEFAULT 'OTHER',
    "released_at" DATE,
    "duration_sec" INTEGER,
    "is_adaptation" BOOLEAN NOT NULL DEFAULT false,
    "original_artist" TEXT,
    "lyricist" TEXT,
    "composer" TEXT,

    CONSTRAINT "songs_pkey" PRIMARY KEY ("entity_id")
);

-- CreateTable
CREATE TABLE "albums" (
    "entity_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "album_type" "album_type" NOT NULL DEFAULT 'OTHER',
    "released_at" DATE,
    "catalog_number" TEXT,
    "track_count" INTEGER,
    "label" TEXT,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("entity_id")
);

-- CreateTable
CREATE TABLE "events" (
    "entity_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "event_type" "event_type" NOT NULL DEFAULT 'OTHER',
    "start_date" DATE,
    "end_date" DATE,
    "venue" TEXT,
    "city" TEXT,
    "country" TEXT DEFAULT 'Indonesia',

    CONSTRAINT "events_pkey" PRIMARY KEY ("entity_id")
);

-- CreateTable
CREATE TABLE "concerts" (
    "entity_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tour_name" TEXT,
    "held_at" DATE,
    "venue" TEXT,
    "city" TEXT,
    "attendance" INTEGER,
    "is_streamed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "concerts_pkey" PRIMARY KEY ("entity_id")
);

-- CreateTable
CREATE TABLE "setlists" (
    "entity_id" TEXT NOT NULL,
    "stage_name" TEXT NOT NULL,
    "revision" TEXT,
    "premiered_at" DATE,
    "song_count" INTEGER,
    "theater" TEXT,

    CONSTRAINT "setlists_pkey" PRIMARY KEY ("entity_id")
);

-- CreateTable
CREATE TABLE "media_items" (
    "entity_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "media_type" "media_type" NOT NULL DEFAULT 'OTHER',
    "released_at" DATE,
    "network" TEXT,
    "publisher" TEXT,
    "external_url" TEXT,

    CONSTRAINT "media_items_pkey" PRIMARY KEY ("entity_id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "entity_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "org_type" "organization_type" NOT NULL DEFAULT 'OTHER',
    "country" TEXT,
    "founded_at" DATE,
    "website" TEXT,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("entity_id")
);

-- CreateTable
CREATE TABLE "eras" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "role" "user_role" NOT NULL DEFAULT 'USER',
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastery_statuses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "min_score" INTEGER NOT NULL,
    "max_score" INTEGER NOT NULL,
    "color_hex" TEXT,
    "description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mastery_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastery_dimension_weights" (
    "id" TEXT NOT NULL,
    "scope" "mastery_scope" NOT NULL,
    "dimension" "mastery_dimension" NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mastery_dimension_weights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastery_records" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "scope" "mastery_scope" NOT NULL,
    "dimension" "mastery_dimension" NOT NULL DEFAULT 'OVERALL',
    "target_entity_id" TEXT,
    "target_key" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "incorrect_count" INTEGER NOT NULL DEFAULT 0,
    "last_practiced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mastery_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_definitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "game_type" "game_type" NOT NULL,
    "difficulty" "difficulty" NOT NULL,
    "target_entity_type" "entity_type" NOT NULL,
    "question_strategy" "question_strategy" NOT NULL,
    "answer_mode" "answer_mode" NOT NULL,
    "clue_count" INTEGER NOT NULL DEFAULT 1,
    "option_count" INTEGER NOT NULL DEFAULT 4,
    "hop_count" INTEGER NOT NULL DEFAULT 1,
    "round_count" INTEGER NOT NULL DEFAULT 5,
    "time_limit_sec" INTEGER,
    "points_correct" INTEGER NOT NULL DEFAULT 10,
    "points_relationship_correct" INTEGER NOT NULL DEFAULT 20,
    "points_incorrect" INTEGER NOT NULL DEFAULT -5,
    "config" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_definition_relationship_types" (
    "game_definition_id" TEXT NOT NULL,
    "relationship_type_id" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "game_definition_relationship_types_pkey" PRIMARY KEY ("game_definition_id","relationship_type_id")
);

-- CreateTable
CREATE TABLE "game_sessions" (
    "id" TEXT NOT NULL,
    "user_id" UUID,
    "game_definition_id" TEXT NOT NULL,
    "game_type" "game_type" NOT NULL,
    "difficulty" "difficulty" NOT NULL,
    "scope_entity_id" TEXT,
    "scope_date" DATE,
    "seed" TEXT NOT NULL,
    "status" "game_session_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "score" INTEGER NOT NULL DEFAULT 0,
    "total_rounds" INTEGER NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "incorrect_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_challenges" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "question_strategy" "question_strategy" NOT NULL,
    "answer_mode" "answer_mode" NOT NULL,
    "prompt" JSONB NOT NULL,
    "options" JSONB,
    "expected_answer" JSONB NOT NULL,
    "subject_entity_id" TEXT,
    "mastery_scope" "mastery_scope",
    "mastery_target_id" TEXT,
    "mastery_dimension" "mastery_dimension",
    "submitted_answer" JSONB,
    "is_correct" BOOLEAN,
    "points_awarded" INTEGER NOT NULL DEFAULT 0,
    "answered_at" TIMESTAMP(3),
    "elapsed_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" UUID,
    "actor_email" TEXT,
    "action" "audit_action" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_health_runs" (
    "id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "issues_found" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "triggered_by" TEXT,

    CONSTRAINT "data_health_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_health_issues" (
    "id" TEXT NOT NULL,
    "run_id" TEXT,
    "check_code" TEXT NOT NULL,
    "severity" "issue_severity" NOT NULL DEFAULT 'WARNING',
    "status" "issue_status" NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "details" JSONB,
    "entity_id" TEXT,
    "relationship_id" TEXT,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "data_health_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "group" TEXT NOT NULL DEFAULT 'general',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "entities_slug_key" ON "entities"("slug");

-- CreateIndex
CREATE INDEX "entities_entity_type_idx" ON "entities"("entity_type");

-- CreateIndex
CREATE INDEX "entities_category_idx" ON "entities"("category");

-- CreateIndex
CREATE INDEX "entities_canonical_name_idx" ON "entities"("canonical_name");

-- CreateIndex
CREATE INDEX "entities_prominence_idx" ON "entities"("prominence");

-- CreateIndex
CREATE UNIQUE INDEX "relationship_types_code_key" ON "relationship_types"("code");

-- CreateIndex
CREATE INDEX "relationship_types_is_active_display_order_idx" ON "relationship_types"("is_active", "display_order");

-- CreateIndex
CREATE INDEX "relationships_source_entity_id_relationship_type_id_idx" ON "relationships"("source_entity_id", "relationship_type_id");

-- CreateIndex
CREATE INDEX "relationships_target_entity_id_relationship_type_id_idx" ON "relationships"("target_entity_id", "relationship_type_id");

-- CreateIndex
CREATE INDEX "relationships_relationship_type_id_idx" ON "relationships"("relationship_type_id");

-- CreateIndex
CREATE INDEX "relationships_valid_from_valid_to_idx" ON "relationships"("valid_from", "valid_to");

-- CreateIndex
CREATE UNIQUE INDEX "relationships_source_entity_id_relationship_type_id_target__key" ON "relationships"("source_entity_id", "relationship_type_id", "target_entity_id", "valid_from");

-- CreateIndex
CREATE INDEX "sources_source_type_idx" ON "sources"("source_type");

-- CreateIndex
CREATE INDEX "members_status_idx" ON "members"("status");

-- CreateIndex
CREATE UNIQUE INDEX "generations_number_key" ON "generations"("number");

-- CreateIndex
CREATE UNIQUE INDEX "teams_code_key" ON "teams"("code");

-- CreateIndex
CREATE INDEX "songs_song_type_idx" ON "songs"("song_type");

-- CreateIndex
CREATE INDEX "events_event_type_idx" ON "events"("event_type");

-- CreateIndex
CREATE INDEX "events_start_date_idx" ON "events"("start_date");

-- CreateIndex
CREATE INDEX "concerts_held_at_idx" ON "concerts"("held_at");

-- CreateIndex
CREATE INDEX "media_items_media_type_idx" ON "media_items"("media_type");

-- CreateIndex
CREATE UNIQUE INDEX "eras_slug_key" ON "eras"("slug");

-- CreateIndex
CREATE INDEX "eras_start_date_idx" ON "eras"("start_date");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_email_key" ON "user_profiles"("email");

-- CreateIndex
CREATE INDEX "user_profiles_role_idx" ON "user_profiles"("role");

-- CreateIndex
CREATE UNIQUE INDEX "mastery_statuses_slug_key" ON "mastery_statuses"("slug");

-- CreateIndex
CREATE INDEX "mastery_statuses_display_order_idx" ON "mastery_statuses"("display_order");

-- CreateIndex
CREATE UNIQUE INDEX "mastery_dimension_weights_scope_dimension_key" ON "mastery_dimension_weights"("scope", "dimension");

-- CreateIndex
CREATE INDEX "mastery_records_user_id_scope_idx" ON "mastery_records"("user_id", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "mastery_records_user_id_scope_dimension_target_key_key" ON "mastery_records"("user_id", "scope", "dimension", "target_key");

-- CreateIndex
CREATE UNIQUE INDEX "game_definitions_code_key" ON "game_definitions"("code");

-- CreateIndex
CREATE INDEX "game_definitions_game_type_difficulty_idx" ON "game_definitions"("game_type", "difficulty");

-- CreateIndex
CREATE INDEX "game_sessions_user_id_started_at_idx" ON "game_sessions"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "game_sessions_game_type_difficulty_idx" ON "game_sessions"("game_type", "difficulty");

-- CreateIndex
CREATE INDEX "game_challenges_subject_entity_id_idx" ON "game_challenges"("subject_entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "game_challenges_session_id_ordinal_key" ON "game_challenges"("session_id", "ordinal");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "data_health_runs_started_at_idx" ON "data_health_runs"("started_at");

-- CreateIndex
CREATE INDEX "data_health_issues_check_code_status_idx" ON "data_health_issues"("check_code", "status");

-- CreateIndex
CREATE INDEX "data_health_issues_status_severity_idx" ON "data_health_issues"("status", "severity");

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_source_entity_id_fkey" FOREIGN KEY ("source_entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_target_entity_id_fkey" FOREIGN KEY ("target_entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_relationship_type_id_fkey" FOREIGN KEY ("relationship_type_id") REFERENCES "relationship_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "songs" ADD CONSTRAINT "songs_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concerts" ADD CONSTRAINT "concerts_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setlists" ADD CONSTRAINT "setlists_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_records" ADD CONSTRAINT "mastery_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_records" ADD CONSTRAINT "mastery_records_target_entity_id_fkey" FOREIGN KEY ("target_entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_definition_relationship_types" ADD CONSTRAINT "game_definition_relationship_types_game_definition_id_fkey" FOREIGN KEY ("game_definition_id") REFERENCES "game_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_definition_relationship_types" ADD CONSTRAINT "game_definition_relationship_types_relationship_type_id_fkey" FOREIGN KEY ("relationship_type_id") REFERENCES "relationship_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_game_definition_id_fkey" FOREIGN KEY ("game_definition_id") REFERENCES "game_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_scope_entity_id_fkey" FOREIGN KEY ("scope_entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_challenges" ADD CONSTRAINT "game_challenges_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_challenges" ADD CONSTRAINT "game_challenges_subject_entity_id_fkey" FOREIGN KEY ("subject_entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_health_issues" ADD CONSTRAINT "data_health_issues_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "data_health_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_health_issues" ADD CONSTRAINT "data_health_issues_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_health_issues" ADD CONSTRAINT "data_health_issues_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
