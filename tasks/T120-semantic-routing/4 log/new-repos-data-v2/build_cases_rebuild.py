#!/usr/bin/env python3
"""T120 Amendment-2 REBUILD case builder. Replaces the REJECTED Amendment-1 64-case set entirely (not reused,
per Amendment 2's own rule -- the OLD set's violate-class construction method is what leaked, "seen" now).

Construction rule (Amendment 2 section 2): every violate case breaks the SPECIFIC thing the named ADR decided
-- a rejected "Considered Options" alternative, a pinned detail (prefix, scheme name, method name, migration
policy), or a layering rule the ADR's own text states -- using code that reads as ORDINARY, unremarkable work
(a small helper, a one-off API call, a quick schema change), never a generically-recognizable "anti-pattern"
(no singleton/bypass/hardcoded framing). Compliant cases are built to the SAME code shape and register as their
paired violate case so no structural/stylistic tell exists between classes.
"""
import json, subprocess, sys
from pathlib import Path

FEAST = Path("/Users/a1/.hermes/cache/scratch/t120c/feast")
PLEDGER = Path("/Users/a1/.hermes/cache/scratch/t120c/pledger-android")
OUT = Path("/Users/a1/.hermes/cache/scratch/t120c/cases_rebuild_raw.json")

def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo)] + list(args), capture_output=True, text=True, check=True).stdout.strip()

def write(repo, rel, text):
    p = repo / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)

def commit_case(repo, case_id, files_text, base_sha):
    # checkout base, write files, commit, capture head, return to base
    git(repo, "checkout", "-q", base_sha)
    for rel, text in files_text.items():
        write(repo, rel, text)
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", f"t120-rebuild-case {case_id}")
    head = git(repo, "rev-parse", "HEAD")
    git(repo, "checkout", "-q", base_sha)
    return head

cases = []

def pair(id_prefix, repo_key, repo, adr_id, violate_files, compliant_files, mode):
    base_sha = git(repo, "rev-parse", "HEAD")
    vhead = commit_case(repo, f"{id_prefix}-violate", violate_files, base_sha)
    base_sha2 = git(repo, "rev-parse", "HEAD")
    assert base_sha == base_sha2
    chead = commit_case(repo, f"{id_prefix}-compliant", compliant_files, base_sha)
    cases.append({"id": f"{id_prefix}-violate", "repo": repo_key, "adr_id": adr_id, "label_constructor_intent": "violate", "base": base_sha, "head": vhead, "mode": mode})
    cases.append({"id": f"{id_prefix}-compliant", "repo": repo_key, "adr_id": adr_id, "label_constructor_intent": "compliant", "base": base_sha, "head": chead, "mode": mode})

def none_case(id_, repo_key, repo, files_text, mode):
    base_sha = git(repo, "rev-parse", "HEAD")
    head = commit_case(repo, id_, files_text, base_sha)
    cases.append({"id": id_, "repo": repo_key, "adr_id": "none", "label_constructor_intent": "no_decision", "base": base_sha, "head": head, "mode": mode})

# =====================================================================================
# FEAST -- 6 pairs
# =====================================================================================

# ADR-0003: on-demand feature views, row-level only (no aggregations)
pair("t120r-fs-adr0003", "feast", FEAST, "adr0003", {
    "sdk/python/feast/examples/basket_affinity.py": (
        "from feast import on_demand_feature_view, Field, RequestSource\n"
        "from feast.types import Float64\n\n"
        "basket_request = RequestSource(name=\"basket\", schema=[Field(name=\"order_id\", dtype=Float64)])\n\n"
        "@on_demand_feature_view(sources=[basket_request], schema=[Field(name=\"basket_total\", dtype=Float64)])\n"
        "def basket_summary(inputs):\n"
        "    out = inputs.copy()\n"
        "    out[\"basket_total\"] = inputs.groupby(\"order_id\")[\"line_amount\"].transform(\"sum\")\n"
        "    return out\n"
    ),
}, {
    "sdk/python/feast/examples/basket_affinity.py": (
        "from feast import on_demand_feature_view, Field, RequestSource\n"
        "from feast.types import Float64\n\n"
        "basket_request = RequestSource(name=\"basket\", schema=[Field(name=\"order_id\", dtype=Float64)])\n\n"
        "@on_demand_feature_view(sources=[basket_request], schema=[Field(name=\"basket_total\", dtype=Float64)])\n"
        "def basket_summary(inputs):\n"
        "    out = inputs.copy()\n"
        "    out[\"basket_total\"] = inputs[\"line_amount\"] + inputs[\"line_tax\"]\n"
        "    return out\n"
    ),
}, "new")

# ADR-0004: join key overrides via with_join_key_map(), not renaming entity columns
pair("t120r-fs-adr0004", "feast", FEAST, "adr0004", {
    "sdk/python/feast/examples/support_tickets.py": (
        "from feast import FeatureService\n\n"
        "def build_duplicate_report_entities(entity_df):\n"
        "    renamed = entity_df.rename(columns={\"user_id\": \"original_reporter_id\"})\n"
        "    return renamed\n\n"
        "duplicate_report_service = FeatureService(name=\"duplicate_report_v1\", features=[])\n"
    ),
}, {
    "sdk/python/feast/examples/support_tickets.py": (
        "from feast import FeatureService\n\n"
        "duplicate_report_service = FeatureService(\n"
        "    name=\"duplicate_report_v1\",\n"
        "    features=[],\n"
        ")\n"
        "# join key override applied on the feature view reference itself, not the entity df\n"
    ),
}, "new")

# ADR-0007: unified FeatureView + @transform decorator, not a new per-type subclass
pair("t120r-fs-adr0007", "feast", FEAST, "adr0007", {
    "sdk/python/feast/graph_feature_view.py": (
        "class GraphFeatureView:\n"
        "    \"\"\"A feature view specialised for graph-neighborhood features.\"\"\"\n\n"
        "    def __init__(self, name, sources, schema):\n"
        "        self.name = name\n"
        "        self.sources = sources\n"
        "        self.schema = schema\n\n"
        "    def materialize(self):\n"
        "        raise NotImplementedError\n"
    ),
}, {
    "sdk/python/feast/graph_feature_view.py": (
        "from feast import FeatureView, transform\n"
        "from feast.feature_view import FeastTransformation\n\n"
        "@transform(type=FeastTransformation.BATCH, schema=[])\n"
        "def graph_neighborhood_features(inputs):\n"
        "    return inputs\n"
    ),
}, "new")

# ADR-0009: new stores implement the OnlineStore interface (contrib/plugins), never a standalone provider
pair("t120r-fs-adr0009", "feast", FEAST, "adr0009", {
    "sdk/python/feast/infra/online_stores/acme_store.py": (
        "class AcmeStore:\n"
        "    def __init__(self, config):\n"
        "        self.config = config\n\n"
        "    def online_read(self, table, entity_keys, requested_features):\n"
        "        return []\n\n"
        "    def online_write_batch(self, table, data):\n"
        "        pass\n"
    ),
}, {
    "sdk/python/feast/infra/online_stores/acme_store.py": (
        "from feast.infra.online_stores.online_store import OnlineStore\n\n"
        "class AcmeOnlineStore(OnlineStore):\n"
        "    def __init__(self, config):\n"
        "        self.config = config\n\n"
        "    def online_read(self, config, table, entity_keys, requested_features):\n"
        "        return []\n\n"
        "    def online_write_batch(self, config, table, data, progress):\n"
        "        pass\n"
    ),
}, "new")

# ADR-0010: vector search via retrieve_online_documents(...), not a bespoke method name
pair("t120r-fs-adr0010", "feast", FEAST, "adr0010", {
    "sdk/python/feast/infra/online_stores/pgvector_search.py": (
        "class PgVectorExtras:\n"
        "    def search_similar(self, table, embedding, top_k):\n"
        "        return self._ann_query(table, embedding, top_k)\n\n"
        "    def _ann_query(self, table, embedding, top_k):\n"
        "        return []\n"
    ),
}, {
    "sdk/python/feast/infra/online_stores/pgvector_search.py": (
        "class PgVectorExtras:\n"
        "    def retrieve_online_documents(self, config, table, requested_feature, embedding, top_k, distance_metric=None):\n"
        "        return self._ann_query(table, embedding, top_k)\n\n"
        "    def _ann_query(self, table, embedding, top_k):\n"
        "        return []\n"
    ),
}, "new")

# ADR-0001: FeatureService groups per-model feature sets; serving code should reference a FeatureService
pair("t120r-fs-adr0001", "feast", FEAST, "adr0001", {
    "sdk/python/feast/examples/fraud_model_serving.py": (
        "def get_fraud_model_features(store, entity_rows):\n"
        "    driver = store.get_online_features(features=[\"driver_hourly_stats:conv_rate\"], entity_rows=entity_rows).to_dict()\n"
        "    customer = store.get_online_features(features=[\"customer_profile:age\"], entity_rows=entity_rows).to_dict()\n"
        "    return {**driver, **customer}\n"
    ),
}, {
    "sdk/python/feast/examples/fraud_model_serving.py": (
        "from feast import FeatureService\n\n"
        "fraud_model_service = FeatureService(\n"
        "    name=\"fraud_model_v1\",\n"
        "    features=[\"driver_hourly_stats:conv_rate\", \"customer_profile:age\"],\n"
        ")\n\n"
        "def get_fraud_model_features(store, entity_rows):\n"
        "    return store.get_online_features(features=fraud_model_service, entity_rows=entity_rows).to_dict()\n"
    ),
}, "new")

# =====================================================================================
# PLEDGER-ANDROID -- 6 pairs
# =====================================================================================

# ADR-004: all business endpoints via the Retrofit PledgerApiService (/v2/api/ prefix), not an ad-hoc OkHttp call
pair("t120r-pg-004", "pledger-android", PLEDGER, "004", {
    "app/src/main/java/com/pledgerio/app/reports/data/remote/ReportsExportHelper.kt": (
        "package com.pledgerio.app.reports.data.remote\n\n"
        "import okhttp3.OkHttpClient\n"
        "import okhttp3.Request\n\n"
        "class ReportsExportHelper(private val baseUrl: String) {\n"
        "    private val client = OkHttpClient()\n\n"
        "    fun fetchExportCsv(reportId: String): String {\n"
        "        val request = Request.Builder().url(\"$baseUrl/export/$reportId.csv\").build()\n"
        "        return client.newCall(request).execute().body?.string().orEmpty()\n"
        "    }\n"
        "}\n"
    ),
}, {
    "app/src/main/java/com/pledgerio/app/reports/data/remote/ReportsExportHelper.kt": (
        "package com.pledgerio.app.reports.data.remote\n\n"
        "import retrofit2.http.GET\n"
        "import retrofit2.http.Path\n\n"
        "interface ReportsExportApi {\n"
        "    @GET(\"/v2/api/reports/{reportId}/export.csv\")\n"
        "    suspend fun fetchExportCsv(@Path(\"reportId\") reportId: String): String\n"
        "}\n"
    ),
}, "new")

# ADR-006: auth-scoped secrets (incl. refresh token) ONLY via SessionManager/EncryptedSharedPreferences
pair("t120r-pg-006", "pledger-android", PLEDGER, "006", {
    "app/src/main/java/com/pledgerio/app/identity/session/SessionRefreshCache.kt": (
        "package com.pledgerio.app.identity.session\n\n"
        "import android.content.Context\n\n"
        "class SessionRefreshCache(context: Context) {\n"
        "    private val prefs = context.getSharedPreferences(\"session_refresh_cache\", Context.MODE_PRIVATE)\n\n"
        "    fun cacheRefreshToken(token: String) {\n"
        "        prefs.edit().putString(\"refresh_token\", token).apply()\n"
        "    }\n"
        "}\n"
    ),
}, {
    "app/src/main/java/com/pledgerio/app/identity/session/SessionRefreshCache.kt": (
        "package com.pledgerio.app.identity.session\n\n"
        "class SessionRefreshCache(private val sessionManager: SessionManager) {\n"
        "    fun cacheRefreshToken(token: String) {\n"
        "        sessionManager.storeRefreshToken(token)\n"
        "    }\n"
        "}\n"
    ),
}, "new")

# ADR-005: schema changes via explicit MIGRATION_x_y, never fallbackToDestructiveMigration()
pair("t120r-pg-005", "pledger-android", PLEDGER, "005", {
    "app/src/main/java/com/pledgerio/app/catalog/data/local/PledgerDatabase.kt": (
        "package com.pledgerio.app.catalog.data.local\n\n"
        "import androidx.room.Room\n"
        "import androidx.room.RoomDatabase\n\n"
        "fun buildDatabase(context: android.content.Context): PledgerDb =\n"
        "    Room.databaseBuilder(context, PledgerDb::class.java, \"pledger.db\")\n"
        "        .fallbackToDestructiveMigration()\n"
        "        .build()\n\n"
        "abstract class PledgerDb : RoomDatabase()\n"
    ),
}, {
    "app/src/main/java/com/pledgerio/app/catalog/data/local/PledgerDatabase.kt": (
        "package com.pledgerio.app.catalog.data.local\n\n"
        "import androidx.room.Room\n"
        "import androidx.room.RoomDatabase\n"
        "import androidx.room.migration.Migration\n"
        "import androidx.sqlite.db.SupportSQLiteDatabase\n\n"
        "val MIGRATION_8_9 = object : Migration(8, 9) {\n"
        "    override fun migrate(db: SupportSQLiteDatabase) {\n"
        "        db.execSQL(\"ALTER TABLE CurrencyEntity ADD COLUMN displayOrder INTEGER NOT NULL DEFAULT 0\")\n"
        "    }\n"
        "}\n\n"
        "fun buildDatabase(context: android.content.Context): PledgerDb =\n"
        "    Room.databaseBuilder(context, PledgerDb::class.java, \"pledger.db\")\n"
        "        .addMigrations(MIGRATION_8_9)\n"
        "        .build()\n\n"
        "abstract class PledgerDb : RoomDatabase()\n"
    ),
}, "new")

# ADR-011: domain/ MUST NOT import data/ (package-boundary convention)
pair("t120r-pg-011", "pledger-android", PLEDGER, "011", {
    "app/src/main/java/com/pledgerio/app/budgets/domain/BudgetThresholdValidator.kt": (
        "package com.pledgerio.app.budgets.domain\n\n"
        "import com.pledgerio.app.budgets.data.remote.BudgetDto\n\n"
        "class BudgetThresholdValidator {\n"
        "    fun isOverThreshold(dto: BudgetDto): Boolean = dto.spentAmount > dto.limitAmount\n"
        "}\n"
    ),
}, {
    "app/src/main/java/com/pledgerio/app/budgets/domain/BudgetThresholdValidator.kt": (
        "package com.pledgerio.app.budgets.domain\n\n"
        "class BudgetThresholdValidator {\n"
        "    fun isOverThreshold(spentAmount: Double, limitAmount: Double): Boolean = spentAmount > limitAmount\n"
        "}\n"
    ),
}, "new")

# ADR-013: annotation processing via ksp(...), never kapt(...)
pair("t120r-pg-013", "pledger-android", PLEDGER, "013", {
    "app/build.gradle.kts.snippet": (
        "dependencies {\n"
        "    kapt(\"com.github.bumptech.glide:compiler:4.16.0\")\n"
        "}\n"
    ),
}, {
    "app/build.gradle.kts.snippet": (
        "dependencies {\n"
        "    ksp(\"com.github.bumptech.glide:ksp-compiler:4.16.0\")\n"
        "}\n"
    ),
}, "new")

# ADR-003: NetworkModule (Hilt @Singleton) provides Retrofit/OkHttp -- not a manually-built client in a ViewModel
pair("t120r-pg-003", "pledger-android", PLEDGER, "003", {
    "app/src/main/java/com/pledgerio/app/reports/presentation/ReportsExportViewModel.kt": (
        "package com.pledgerio.app.reports.presentation\n\n"
        "import androidx.lifecycle.ViewModel\n"
        "import retrofit2.Retrofit\n"
        "import retrofit2.converter.moshi.MoshiConverterFactory\n\n"
        "class ReportsExportViewModel : ViewModel() {\n"
        "    private val retrofit = Retrofit.Builder()\n"
        "        .baseUrl(\"https://reports.pledger.io/\")\n"
        "        .addConverterFactory(MoshiConverterFactory.create())\n"
        "        .build()\n"
        "}\n"
    ),
}, {
    "app/src/main/java/com/pledgerio/app/reports/presentation/ReportsExportViewModel.kt": (
        "package com.pledgerio.app.reports.presentation\n\n"
        "import androidx.lifecycle.ViewModel\n"
        "import dagger.hilt.android.lifecycle.HiltViewModel\n"
        "import javax.inject.Inject\n\n"
        "@HiltViewModel\n"
        "class ReportsExportViewModel @Inject constructor(\n"
        "    private val reportsExportApi: com.pledgerio.app.reports.data.remote.ReportsExportApi,\n"
        ") : ViewModel()\n"
    ),
}, "new")

# =====================================================================================
# no_decision distractors -- ordinary edits that touch neither repo's ADR-governed area
# =====================================================================================
none_case("t120r-none-1", "feast", FEAST, {"sdk/python/feast/examples/README.md": "# Examples\n\nSample scripts demonstrating Feast usage patterns.\n"}, "new")
none_case("t120r-none-2", "feast", FEAST, {"sdk/python/feast/utils_string_format.py": "def snake_to_title(s: str) -> str:\n    return \" \".join(w.capitalize() for w in s.split(\"_\"))\n"}, "new")
none_case("t120r-none-3", "feast", FEAST, {"sdk/python/feast/examples/changelog_notes.py": "CHANGELOG_NOTES = [\n    \"Improved CLI help text wording\",\n    \"Fixed a typo in the quickstart guide\",\n]\n"}, "new")
none_case("t120r-none-4", "feast", FEAST, {"sdk/python/feast/examples/color_palette.py": "BRAND_COLORS = {\"primary\": \"#0A66C2\", \"secondary\": \"#111827\"}\n"}, "new")
none_case("t120r-none-5", "pledger-android", PLEDGER, {"app/src/main/java/com/pledgerio/app/util/CurrencyFormatterExtras.kt": "package com.pledgerio.app.util\n\nfun formatCompact(amount: Double): String = String.format(\"%.1fK\", amount / 1000)\n"}, "new")
none_case("t120r-none-6", "pledger-android", PLEDGER, {"docs/CONTRIBUTING_NOTES.md": "# Contributing Notes\n\nRun `./gradlew test` before opening a PR.\n"}, "new")
none_case("t120r-none-7", "pledger-android", PLEDGER, {"app/src/main/java/com/pledgerio/app/util/DateRangeLabel.kt": "package com.pledgerio.app.util\n\nenum class DateRangeLabel { THIS_WEEK, THIS_MONTH, THIS_YEAR }\n"}, "new")
none_case("t120r-none-8", "pledger-android", PLEDGER, {"app/src/test/java/com/pledgerio/app/util/CurrencyFormatterExtrasTest.kt": "package com.pledgerio.app.util\n\nimport org.junit.Test\nimport org.junit.Assert.assertEquals\n\nclass CurrencyFormatterExtrasTest {\n    @Test fun formats() { assertEquals(\"1.2K\", formatCompact(1234.0)) }\n}\n"}, "new")

OUT.write_text(json.dumps(cases, indent=2))
from collections import Counter
print("pairs+none built:", len(cases))
print("label mix:", Counter(c["label_constructor_intent"] for c in cases))
print("repo mix:", Counter(c["repo"] for c in cases))
for repo in (FEAST, PLEDGER):
    status = git(repo, "status", "--porcelain")
    print(repo.name, "clean" if not status else f"DIRTY:\n{status}")
