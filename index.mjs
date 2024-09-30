import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import csv from 'csv-parser';
import cosineSimilarity from 'compute-cosine-similarity';


dotenv.config();

const client = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
});

//Convert Query into OpenAI embedding using the openai embeddings api
async function convertQueryToEmbedding(query) {

    const response = await client.embeddings.create({
        model: "text-embedding-ada-002",
        input: query.text
      });

      query.embedding = response.data[0].embedding

      console.log(response.data);

      return response;
      
}

async function processCSV(url) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(url)
      .pipe(csv())
      .on('data', (row) => {
        results.push(row);
      })
      .on('end', () => {
        console.log('CSV file successfully processed');
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

// Cosine similarity function to compare the query embedding to the data embedding.
// Rank the embeddings based on similarity and return the top 5 results.

// Function to calculate similarities and return the top 5 most similar data objects
async function similarityCheck(query, data) {
  const results = data.map((row) => {
    //ensure row.embedding is an array
    row.embedding = row.embedding.slice(1, -1).split(',').map(parseFloat);
    const similarityScore = cosineSimilarity(query.embedding, row.embedding);
    return { ...row, similarityScore };  // Add the similarity score to the result
  });

  // Sort by similarity score in descending order
  results.sort((a, b) => b.similarityScore - a.similarityScore);

  // Return the top most similar results
  return results.slice(0, 10);
}

// Prompt OpenAi for a completion using the similarity results
async function sendContextualizedPrompt(userInput, similarityResults) {
  let promptInProgress = 'You are a sports analyst handling questions about the Olympics. \n A user asks you about: ' + userInput.text + '\n provide an analytical response based on the following article content: \n';

  //iterate through similarityresults and add to prompt
  similarityResults.forEach((result, index) => {
    promptInProgress += `${index + 1}. ${result.text} \n`;
  });

  const response = await client.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: promptInProgress },
    ],
    max_tokens: 100,
    temperature: 0,
    top_p: 1,
    n: 1,
    stream: false,
  });

  console.log(response.choices[0].message.content);
}


(async () => {
    console.log('Starting CSV processing');
  try {
    let exampleQuery = {"text":"Which athletes won the gold medal in curling at the 2022 Winter Olympics?", "embedding":[]};
    const query = await convertQueryToEmbedding(exampleQuery);
    const data = await processCSV('./winter_olympics_2022.csv');
    const topResults = await similarityCheck(exampleQuery, data);
    console.log(topResults);
    await sendContextualizedPrompt(exampleQuery, topResults);
  } catch (error) {
    console.error('Error processing CSV file:', error);
  }
})();

