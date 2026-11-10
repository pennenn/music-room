plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "io.github.pennenn.musicroom"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.pennenn.musicroom"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        // 最近の Android 携帯向け（容量を抑えるため 64bit のみ）。エミュレーターでの確認時は -Pabis=x86_64
        ndk { abiFilters += (project.findProperty("abis") as String? ?: "arm64-v8a").split(",") }
    }
    buildTypes {
        release { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging { jniLibs { useLegacyPackaging = true } }   // yt-dlp（Python）を展開して使うため
}

// 画面（HTML/JS）はリポジトリ直下の携帯版と同じものをアプリに同梱する
val copyWeb by tasks.registering(Copy::class) {
    from(rootDir.parentFile) {
        include("index.html", "js/**", "icons/**", "manifest.webmanifest")
    }
    into(layout.projectDirectory.dir("src/main/assets/web"))
}
tasks.named("preBuild") { dependsOn(copyWeb) }

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.media3:media3-exoplayer:1.5.1")
    implementation("androidx.media3:media3-session:1.5.1")
    implementation("io.github.junkfood02.youtubedl-android:library:0.18.1")
    implementation("io.github.junkfood02.youtubedl-android:ffmpeg:0.18.1")
}
