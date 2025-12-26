#!/bin/bash

if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

API_KEY="${MISTRAL_API_KEY}"
BASE_URL="${MISTRAL_BASE_URL:-https://api.mistral.ai/v1}"
MODEL="${MISTRAL_MODEL:-mistral-large-latest}"

if [ -z "$API_KEY" ]; then
  echo "Error: MISTRAL_API_KEY not set"
  exit 1
fi

echo "Testing Mistral API..."
echo "Base URL: $BASE_URL"
echo "Model: $MODEL"
echo ""

curl -X POST "$BASE_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{
    \"model\": \"$MODEL\",
    \"messages\": [
      {
        \"role\": \"system\",
        \"content\": \"Tu es un assistant Discord.\"
      },
      {
        \"role\": \"user\",
        \"content\": \"Dis bonjour\"
      }
    ]
  }" | jq '.'

echo ""
echo "Testing with tools..."
echo ""

curl -X POST "$BASE_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{
    \"model\": \"gpt-4\",
    \"messages\": [
      {
        \"role\": \"system\",
        \"content\": \"Tu es un assistant Discord.\"
      },
      {
        \"role\": \"user\",
        \"content\": \"Donne la liste des membres dans le serveur royaume 1095123126746099834\"
      }
    ],
    \"tools\": [
      {
        \"type\": \"function\",
        \"function\": {
          \"name\": \"getMembers\",
          \"description\": \"Get all members in a guild\",
          \"parameters\": {
            \"type\": \"object\",
            \"properties\": {
              \"guildId\": {
                \"type\": \"string\",
                \"description\": \"The guild ID\"
              }
            },
            \"required\": [\"guildId\"]
          }
        }
      }
    ]
  }" | jq '.'
