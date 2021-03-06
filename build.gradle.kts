plugins {
    id("com.github.johnrengelman.shadow") version "6.1.0"
    id("com.github.ben-manes.versions") version "0.36.0"
    id("com.palantir.git-version") version "0.12.3"
    application
    kotlin("jvm") version "1.4.30"
    id("maven-publish")
}

application {
    mainClassName = "com.github.creeper123123321.viaaas.VIAaaSKt"
}

java {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
}

val gitVersion: groovy.lang.Closure<String> by extra

group = "com.github.creeper123123321.viaaas"
version = "0.2.0-SNAPSHOT+" + try {
    gitVersion()
} catch (e: Exception) {
    "unknown"
}

extra.set("archivesBaseName", "VIAaaS")

repositories {
    mavenCentral()
    maven("https://oss.sonatype.org/content/repositories/snapshots")
    maven("https://repo.viaversion.com/")
    maven("https://repo.aikar.co/content/groups/aikar/")
}

dependencies {
    implementation("us.myles:viaversion:3.2.1") { isTransitive = false }
    implementation("nl.matsv:viabackwards-all:3.2.0") { isTransitive = false }
    implementation("de.gerrygames:viarewind-all:1.5.2") { isTransitive = false }
    implementation("io.netty:netty-all:4.1.58.Final")
    implementation("org.yaml:snakeyaml:1.26")
    implementation("com.google.guava:guava:30.0-jre")
    implementation("co.aikar:fastutil-lite:1.0")

    implementation("org.apache.logging.log4j:log4j-core:2.13.3")
    implementation("org.apache.logging.log4j:log4j-slf4j-impl:2.13.3")
    implementation("org.slf4j:slf4j-api:1.7.30")
    implementation("net.minecrell:terminalconsoleappender:1.2.0")
    implementation("org.jline:jline-terminal-jansi:3.12.1")

    val ktorVersion = "1.5.1"

    implementation(kotlin("stdlib-jdk8"))
    implementation("io.ktor:ktor-network-tls-certificates:$ktorVersion")
    implementation("io.ktor:ktor-server-netty:$ktorVersion")
    implementation("io.ktor:ktor-client-core:$ktorVersion")
    implementation("io.ktor:ktor-client-core-jvm:$ktorVersion")
    implementation("io.ktor:ktor-client-cio:$ktorVersion")
    implementation("io.ktor:ktor-client-logging-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-core:$ktorVersion")
    implementation("io.ktor:ktor-client-gson:$ktorVersion")
    implementation("io.ktor:ktor-server-host-common:$ktorVersion")
    implementation("io.ktor:ktor-websockets:$ktorVersion")
    testImplementation("io.ktor:ktor-server-test-host:$ktorVersion")
}

val run: JavaExec by tasks
run.standardInput = System.`in`

project.configurations.implementation.get().isCanBeResolved = true


tasks {
    named<com.github.jengelman.gradle.plugins.shadow.tasks.ShadowJar>("shadowJar") {
        configurations = listOf(project.configurations.implementation.get())
        transform(com.github.jengelman.gradle.plugins.shadow.transformers.Log4j2PluginsCacheFileTransformer::class.java)
    }
    build {
        dependsOn(shadowJar)
        dependsOn(named("dependencyUpdates"))
    }
}

tasks.named<ProcessResources>("processResources") {
    filesMatching("viaaas_info.json") {
        filter<org.apache.tools.ant.filters.ReplaceTokens>("tokens" to mapOf(
                "version" to project.property("version")
        ))
    }
}

val compileKotlin: org.jetbrains.kotlin.gradle.tasks.KotlinCompile by tasks
compileKotlin.kotlinOptions.jvmTarget = "11"

publishing {
    publications {
        create<MavenPublication>("maven") {
            artifact(tasks.getByName("shadowJar")) {
                builtBy(tasks.getByName("shadowJar"))
            }
        }
    }
    repositories {
        // mavenLocal()
    }
}
