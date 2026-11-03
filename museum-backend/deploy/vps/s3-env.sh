s3_setting() {
  sed -n "s/^$1=//p" "${S3_ENV_FILE}" | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

S3_ENDPOINT="$(s3_setting S3_ENDPOINT)"
S3_BUCKET="$(s3_setting S3_BUCKET)"
export AWS_ACCESS_KEY_ID="$(s3_setting S3_ACCESS_KEY_ID)"
export AWS_SECRET_ACCESS_KEY="$(s3_setting S3_SECRET_ACCESS_KEY)"
export AWS_REGION="$(s3_setting S3_REGION)"
