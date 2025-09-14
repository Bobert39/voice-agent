#!/bin/bash

# Generate self-signed SSL certificates for local development
# DO NOT USE IN PRODUCTION

set -e

CERT_DIR="infrastructure/ssl/dev-certs"
mkdir -p "$CERT_DIR"

echo "🔐 Generating self-signed SSL certificates for development..."

# Generate private key
openssl genrsa -out "$CERT_DIR/dev.key" 2048

# Generate certificate signing request
openssl req -new -key "$CERT_DIR/dev.key" -out "$CERT_DIR/dev.csr" -subj "/C=US/ST=Illinois/L=Springfield/O=Capitol Eye Care/OU=Development/CN=localhost"

# Generate self-signed certificate
openssl x509 -req -in "$CERT_DIR/dev.csr" -signkey "$CERT_DIR/dev.key" -out "$CERT_DIR/dev.crt" -days 365 -extensions v3_req -extfile <(
cat <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req

[req_distinguished_name]

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
DNS.3 = voice-agent.local
DNS.4 = *.voice-agent.local
IP.1 = 127.0.0.1
IP.2 = ::1
EOF
)

# Create combined certificate file
cat "$CERT_DIR/dev.crt" "$CERT_DIR/dev.key" > "$CERT_DIR/dev-combined.pem"

# Set appropriate permissions
chmod 600 "$CERT_DIR/dev.key"
chmod 644 "$CERT_DIR/dev.crt"
chmod 600 "$CERT_DIR/dev-combined.pem"

# Clean up CSR
rm "$CERT_DIR/dev.csr"

echo "✅ SSL certificates generated successfully!"
echo "📁 Certificate files:"
echo "   - Private key: $CERT_DIR/dev.key"
echo "   - Certificate: $CERT_DIR/dev.crt"
echo "   - Combined: $CERT_DIR/dev-combined.pem"
echo ""
echo "⚠️  These are self-signed certificates for development only."
echo "💡 Add the certificate to your browser's trusted certificates to avoid warnings."
echo ""
echo "📋 To trust the certificate on macOS:"
echo "   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain $PWD/$CERT_DIR/dev.crt"
echo ""
echo "📋 To trust the certificate on Linux:"
echo "   sudo cp $PWD/$CERT_DIR/dev.crt /usr/local/share/ca-certificates/voice-agent-dev.crt"
echo "   sudo update-ca-certificates"