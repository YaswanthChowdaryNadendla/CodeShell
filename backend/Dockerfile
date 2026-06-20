FROM eclipse-temurin:21-jdk

RUN apt-get update && apt-get install -y \
    python3 \
    nodejs \
    npm \
    g++ \
    maven \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN mvn clean package

EXPOSE 8080

CMD ["java","-jar","target/backend-0.0.1-SNAPSHOT.jar"]