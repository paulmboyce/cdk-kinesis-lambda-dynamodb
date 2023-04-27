## Compiling the GO sources

Sources are in /src

The following commands will build the producer and consumer GO binaries in /bin



```
cd ./src
go mod init bragaboo.com/m/v2 && go mod tidy
go build -o bin/ src/consumer.go
go build -o bin/ src/producer.go
````
