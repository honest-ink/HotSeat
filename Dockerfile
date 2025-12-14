# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . .

# Install any needed packages specified in requirements.txt
# (Make sure you have a requirements.txt file!)
RUN pip install --no-cache-dir -r requirements.txt

# Make port 8080 available to the world outside this container
EXPOSE 8080

# Run the application. 
# IMPORTANT: Change 'main.py' to whatever your main script is named (e.g., app.py, server.py)
CMD ["python", "main.py"]
